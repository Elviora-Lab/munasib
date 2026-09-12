'use server';

import { revalidatePath } from 'next/cache';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/db';

import { withAction } from '../_with-action';

import { requireAdmin } from '@/server/auth/guards';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { transitionOrder } from '@/server/services/order-transitions.service';
import { syncPostExOrder } from '@/server/services/postex-sync.service';
import {
  buildPrintAssetsAtBookTime,
  invoiceSnapshotOrderInclude,
} from '@/server/shipping/invoice-print-snapshot';
import {
  cancelPostExOrder,
  createPostExOrder,
  getPostExPaymentStatus,
} from '@/server/shipping/postex';

const statusValues = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

const updateStatusBody = z.object({
  orderId: z.string().uuid(),
  status: z.enum(statusValues),
  note: z.string().max(500).optional(),
});

export const updateOrderStatus = withAction(async (input: z.infer<typeof updateStatusBody>) => {
  const session = await requireAdmin();
  const { orderId, status, note } = updateStatusBody.parse(input);
  await transitionOrder(orderId, status, note, session.sub);
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return { orderId, status };
});

const bulkBody = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(statusValues),
  note: z.string().max(500).optional(),
});

/**
 * Apply the same status transition to many orders at once. Runs each
 * transition (order update + statusHistory insert + restock/notification
 * side effects) serially so each one gets its own audit row with the
 * correct actor.
 */
export const bulkUpdateOrderStatus = withAction(async (input: z.infer<typeof bulkBody>) => {
  const session = await requireAdmin();
  const { orderIds, status, note } = bulkBody.parse(input);

  let updated = 0;
  for (const orderId of orderIds) {
    try {
      await transitionOrder(orderId, status, note, session.sub);
      updated += 1;
    } catch {
      // Skip individual failures (e.g. order deleted between selection
      // and submit) so one bad row doesn't abort the rest of the batch.
    }
  }

  revalidatePath('/admin/orders');
  return { updated, requested: orderIds.length, status };
});

// ---------------------------------------------------------------------------
// Courier — PostEx
// ---------------------------------------------------------------------------

/** Book an order with PostEx, store the tracking number, and move to PROCESSING. */
const orderIdInput = z.object({ orderId: z.string().uuid() });
const PAYMENT_CLOSED_TO_SETTLEMENT = new Set(['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED']);

async function bookOrderWithPostEx(orderId: string, changedBy: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      ...invoiceSnapshotOrderInclude,
      shipments: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.shipments.some((s) => s.trackingNumber)) {
    throw new BadRequestError('This order is already booked with a courier');
  }
  if (
    !order.shippingCity ||
    !order.shippingFullName ||
    !order.shippingPhone ||
    !order.shippingAddressLine1
  ) {
    throw new BadRequestError('Order is missing a complete shipping address');
  }

  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  const cod = order.paymentStatus === 'PAID' ? 0 : Number(order.totalAmount);
  const deliveryAddress = [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    order.shippingArea,
  ]
    .filter(Boolean)
    .join(', ');

  const { trackingNumber } = await createPostExOrder({
    cityName: order.shippingCity,
    customerName: order.shippingFullName,
    customerPhone: order.shippingPhone,
    deliveryAddress,
    invoicePayment: cod,
    items: itemCount,
    orderRefNumber: order.orderNumber,
    orderDetail: order.items
      .map((i) => `${i.quantity}x ${i.productName}`)
      .join(', ')
      .slice(0, 500),
  });

  // Capture thumbs + AWB now so Invoice+AWB print is DB-only later.
  const { snapshot: printSnapshot, awbPdf } = await buildPrintAssetsAtBookTime(
    order,
    trackingNumber,
  );

  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courierName: 'PostEx',
      trackingNumber,
      // Label exists; parcel is not handed to the courier yet — SHIPPED comes later.
      shipmentStatus: 'LABEL_CREATED',
      trackingStatusText: 'Booked',
      trackingSyncedAt: new Date(),
      printSnapshot,
      ...(awbPdf ? { awbPdf: Buffer.from(awbPdf) } : {}),
    },
  });
  await transitionOrder(
    order.id,
    'PROCESSING',
    `Booked with PostEx (${trackingNumber})`,
    changedBy,
  );

  return { orderId: order.id, trackingNumber };
}

export const bookWithPostEx = withAction(async (input: { orderId: string }) => {
  const { orderId } = orderIdInput.parse(input);
  const session = await requireAdmin();
  const result = await bookOrderWithPostEx(orderId, session.sub);
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return result;
});

const bulkBookBody = z.object({
  // Match bulk status / page selection size. Prefer client chunking for large
  // batches so a single PostEx round-trip wave does not hit the action timeout.
  orderIds: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * Book many orders with PostEx. Continues past individual failures so one bad
 * address does not abort the rest of the batch.
 */
export const bulkBookWithPostEx = withAction(async (input: z.infer<typeof bulkBookBody>) => {
  const session = await requireAdmin();
  const { orderIds } = bulkBookBody.parse(input);

  const booked: Array<{ orderId: string; trackingNumber: string }> = [];
  const failed: Array<{ orderId: string; message: string }> = [];

  for (const orderId of orderIds) {
    try {
      booked.push(await bookOrderWithPostEx(orderId, session.sub));
    } catch (err) {
      failed.push({
        orderId,
        message: err instanceof Error ? err.message : 'Booking failed',
      });
    }
  }

  revalidatePath('/admin/orders');
  return {
    booked: booked.length,
    failed: failed.length,
    trackingNumbers: booked.map((b) => b.trackingNumber),
    bookedOrderIds: booked.map((b) => b.orderId),
    errors: failed,
  };
});

// ---------------------------------------------------------------------------
// Manual shipment — any courier
// ---------------------------------------------------------------------------

const manualShipmentBody = z.object({
  orderId: z.string().uuid(),
  courierName: z.string().trim().min(2).max(120),
  trackingNumber: z.string().trim().min(3).max(120),
});

/**
 * Record a shipment booked outside the integrated courier (TCS, Leopards,
 * a bike rider — anything). Stores the tracking number and marks the order
 * shipped, which also notifies the customer.
 */
export const addManualShipment = withAction(async (input: z.infer<typeof manualShipmentBody>) => {
  const session = await requireAdmin();
  const { orderId, courierName, trackingNumber } = manualShipmentBody.parse(input);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipments: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.shipments.some((s) => s.trackingNumber)) {
    throw new BadRequestError('This order already has a shipment recorded');
  }

  await prisma.shipment.create({
    data: {
      orderId,
      courierName,
      trackingNumber,
      shipmentStatus: 'IN_TRANSIT',
      trackingStatusText: 'In transit',
      trackingSyncedAt: new Date(),
      shippedAt: new Date(),
    },
  });
  await transitionOrder(
    orderId,
    'SHIPPED',
    `Shipped via ${courierName} (${trackingNumber})`,
    session.sub,
  );

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return { trackingNumber };
});

// ---------------------------------------------------------------------------
// Payment reconciliation — COD / bank transfer
// ---------------------------------------------------------------------------

/**
 * Mark an order's payment as received outside the gateway (cash on delivery,
 * bank transfer). Settles existing payment rows or records a COD payment if
 * none exist, and leaves an audit note in the status history.
 */
export const markPaymentReceived = withAction(async (input: { orderId: string }) => {
  const { orderId } = orderIdInput.parse(input);
  const session = await requireAdmin();

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { orderStatus: true, paymentStatus: true, totalAmount: true },
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.paymentStatus === 'PAID') {
      throw new BadRequestError('This order is already marked paid');
    }
    if (order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
      throw new BadRequestError('Refunded orders cannot be marked paid');
    }

    const settled = await tx.payment.updateMany({
      where: { orderId, paymentStatus: { in: ['PENDING', 'AUTHORIZED', 'FAILED'] } },
      data: { paymentStatus: 'PAID', paidAt: new Date() },
    });
    if (settled.count === 0) {
      await tx.payment.create({
        data: {
          orderId,
          paymentMethod: 'COD',
          amount: order.totalAmount,
          paymentStatus: 'PAID',
          paidAt: new Date(),
        },
      });
    }

    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        note: 'Payment received (marked manually)',
        changedBy: session.sub,
      },
    });
  });

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return { orderId };
});

/** Pull PostEx tracking and reconcile shipment + order status for one order. */
export const refreshPostExTracking = withAction(async (input: { orderId: string }) => {
  const { orderId } = orderIdInput.parse(input);
  await requireAdmin();
  const result = await syncPostExOrder(orderId);
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return result;
});

/**
 * Cancel a PostEx booking (mis-booked parcel, address fix, etc.). Removes the
 * shipment row so the order can be re-booked. Status stays PROCESSING (booking
 * never marked the order SHIPPED).
 */
export const cancelPostExBooking = withAction(async (input: { orderId: string }) => {
  const { orderId } = orderIdInput.parse(input);
  const session = await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipments: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  const shipment = order.shipments.find((s) => s.courierName === 'PostEx' && s.trackingNumber);
  if (!shipment?.trackingNumber) throw new BadRequestError('No PostEx booking to cancel');

  await cancelPostExOrder(shipment.trackingNumber);
  await prisma.shipment.delete({ where: { id: shipment.id } });
  // Keep PROCESSING if already there; only write history when status changes.
  await transitionOrder(
    orderId,
    'PROCESSING',
    `PostEx booking cancelled (${shipment.trackingNumber})`,
    session.sub,
  );

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  return { orderId };
});

const trackingLookupBody = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(200),
});

/** Resolve PostEx tracking numbers for selected orders (for bulk label print). */
export const getPostExTrackingForOrders = withAction(
  async (input: z.infer<typeof trackingLookupBody>) => {
    await requireAdmin();
    const { orderIds } = trackingLookupBody.parse(input);
    const shipments = await prisma.shipment.findMany({
      where: {
        orderId: { in: orderIds },
        courierName: 'PostEx',
        trackingNumber: { not: null },
      },
      select: { orderId: true, trackingNumber: true },
      orderBy: { shippedAt: 'desc' },
    });
    const trackingNumbers = [
      ...new Set(
        shipments.map((s) => s.trackingNumber).filter((t): t is string => Boolean(t?.trim())),
      ),
    ];
    return {
      trackingNumbers,
      missing: orderIds.length - new Set(shipments.map((s) => s.orderId)).size,
    };
  },
);

const fulfillmentIdsBody = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * Record that kitchen printed labels / PostEx AWBs for these orders.
 * Idempotent — does not overwrite an earlier labelPrintedAt.
 */
export const markLabelsPrinted = withAction(async (input: z.infer<typeof fulfillmentIdsBody>) => {
  const session = await requireAdmin();
  const { orderIds } = fulfillmentIdsBody.parse(input);
  const { stampLabelsPrintedForOrders } =
    await import('@/server/services/fulfillment-print.service');
  const updated = await stampLabelsPrintedForOrders(orderIds, session.sub);
  revalidatePath('/admin/orders');
  return { updated, requested: orderIds.length };
});

/**
 * Mark selected orders as packed / arranged. Requires a booked shipment;
 * stamps packedAt (and labelPrintedAt if somehow still null).
 */
export const bulkMarkPacked = withAction(async (input: z.infer<typeof fulfillmentIdsBody>) => {
  const session = await requireAdmin();
  const { orderIds } = fulfillmentIdsBody.parse(input);
  const now = new Date();

  const shipments = await prisma.shipment.findMany({
    where: {
      orderId: { in: orderIds },
      trackingNumber: { not: null },
      packedAt: null,
    },
    select: { id: true, orderId: true, labelPrintedAt: true },
  });

  if (shipments.length === 0) {
    return { packed: 0, requested: orderIds.length, orderIds: [] as string[] };
  }

  await prisma.$transaction(
    shipments.map((s) =>
      prisma.shipment.update({
        where: { id: s.id },
        data: {
          packedAt: now,
          packedBy: session.sub,
          ...(s.labelPrintedAt ? {} : { labelPrintedAt: now, labelPrintedBy: session.sub }),
        },
      }),
    ),
  );

  revalidatePath('/admin/orders');
  return {
    packed: shipments.length,
    requested: orderIds.length,
    orderIds: [...new Set(shipments.map((s) => s.orderId))],
  };
});

/**
 * Check whether PostEx has settled the COD cash for this order. When it has and
 * we haven't recorded payment yet, reconcile: the money is collected and paid
 * out, so the order becomes PAID. Returns the settlement details for display.
 */
export const refreshPostExPayment = withAction(async (input: { orderId: string }) => {
  const { orderId } = orderIdInput.parse(input);
  const session = await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipments: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  const trackingNumber = order.shipments.find(
    (s) => s.courierName === 'PostEx' && s.trackingNumber,
  )?.trackingNumber;
  if (!trackingNumber) throw new BadRequestError('No PostEx booking on this order');

  const settlement = await getPostExPaymentStatus(trackingNumber);

  if (settlement.settled && order.paymentStatus !== 'PAID') {
    if (PAYMENT_CLOSED_TO_SETTLEMENT.has(order.paymentStatus)) {
      throw new BadRequestError('Refunded or voided orders cannot be marked paid');
    }

    await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { paymentStatus: true },
      });
      if (!current) throw new NotFoundError('Order not found');
      if (current.paymentStatus === 'PAID') return;
      if (PAYMENT_CLOSED_TO_SETTLEMENT.has(current.paymentStatus)) {
        throw new BadRequestError('Refunded or voided orders cannot be marked paid');
      }

      const settled = await tx.payment.updateMany({
        where: { orderId, paymentStatus: { in: ['PENDING', 'AUTHORIZED', 'FAILED'] } },
        data: { paymentStatus: 'PAID', paidAt: new Date() },
      });
      if (settled.count === 0) {
        await tx.payment.create({
          data: {
            orderId,
            paymentMethod: 'COD',
            amount: order.totalAmount,
            paymentStatus: 'PAID',
            paidAt: new Date(),
          },
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: order.orderStatus,
          note: `COD settled by PostEx${settlement.cprNumber ? ` (CPR ${settlement.cprNumber})` : ''}`,
          changedBy: session.sub,
        },
      });
    });
  }

  revalidatePath(`/admin/orders/${orderId}`);
  return settlement;
});
