import 'server-only';

import { PDFDocument } from 'pdf-lib';

import { prisma } from '@/lib/db';

import {
  buildKitchenlyInvoicePdf,
  type InvoiceOrder,
} from '@/server/shipping/kitchenly-invoice-pdf';
import { getPostExAirwayBill } from '@/server/shipping/postex';

/** Prefer JPEG/PNG — pdf-lib cannot embed WebP. */
function pickPdfSafeImage(urls: Array<string | null | undefined>): string | null {
  const clean = urls.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (clean.length === 0) return null;
  return clean.find((u) => !/\.webp(?:$|\?)/i.test(u)) ?? null;
}

async function loadOrdersForInvoicePack(orderIds: string[]) {
  return prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: {
      items: {
        orderBy: { id: 'asc' },
        include: {
          variant: {
            select: {
              images: {
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                take: 8,
                select: { imageUrl: true },
              },
            },
          },
          product: {
            select: {
              images: {
                where: { variantId: null },
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                take: 8,
                select: { imageUrl: true },
              },
            },
          },
        },
      },
      shipments: {
        where: { courierName: 'PostEx', trackingNumber: { not: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { trackingNumber: true },
      },
    },
  });
}

function toInvoiceOrder(
  order: Awaited<ReturnType<typeof loadOrdersForInvoicePack>>[number],
): InvoiceOrder {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    discountAmount: Number(order.discountAmount),
    discountLabel: order.discountLabel,
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    shippingFullName: order.shippingFullName,
    shippingPhone: order.shippingPhone,
    shippingCity: order.shippingCity,
    shippingAddressLine1: order.shippingAddressLine1,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      imageUrl: pickPdfSafeImage([
        ...(item.variant?.images.map((i) => i.imageUrl) ?? []),
        ...(item.product?.images.map((i) => i.imageUrl) ?? []),
      ]),
    })),
  };
}

export type InvoiceAwbPackResult = {
  pdf: Uint8Array;
  trackingNumbers: string[];
  /** Orders in the request that had no PostEx tracking (skipped). */
  skipped: number;
};

/**
 * One printable PDF: for each booked order, Kitchenly invoice (with photos)
 * then that order's PostEx airway bill — interleaved so packs stay matched.
 */
export async function buildInvoiceAndPostExAwbPdf(
  orderIds: string[],
): Promise<InvoiceAwbPackResult> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error('No order ids provided');
  }

  const rows = await loadOrdersForInvoicePack(ids);
  const byId = new Map(rows.map((o) => [o.id, o]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;

  const merged = await PDFDocument.create();
  const trackingNumbers: string[] = [];
  let skipped = 0;

  for (const order of ordered) {
    const tracking = order.shipments[0]?.trackingNumber?.trim();
    if (!tracking) {
      skipped += 1;
      continue;
    }

    const invoiceBytes = await buildKitchenlyInvoicePdf(toInvoiceOrder(order));
    const invoiceDoc = await PDFDocument.load(invoiceBytes);
    for (const page of await merged.copyPages(invoiceDoc, invoiceDoc.getPageIndices())) {
      merged.addPage(page);
    }

    const awbBytes = await getPostExAirwayBill([tracking]);
    const awbDoc = await PDFDocument.load(awbBytes);
    for (const page of await merged.copyPages(awbDoc, awbDoc.getPageIndices())) {
      merged.addPage(page);
    }

    trackingNumbers.push(tracking);
  }

  if (trackingNumbers.length === 0) {
    throw new Error('No PostEx tracking numbers on the selected orders — book first');
  }

  return {
    pdf: await merged.save(),
    trackingNumbers,
    skipped,
  };
}
