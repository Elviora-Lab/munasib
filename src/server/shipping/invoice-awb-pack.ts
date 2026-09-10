import 'server-only';

import { PDFDocument } from 'pdf-lib';

import { prisma } from '@/lib/db';

import {
  buildKitchenlyInvoicePdf,
  type InvoiceOrder,
} from '@/server/shipping/kitchenly-invoice-pdf';
import { getPostExAirwayBillsByTracking } from '@/server/shipping/postex';

/** How many Kitchenly invoices to render at once (each pulls product images). */
const INVOICE_BUILD_CONCURRENCY = 4;

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
      payments: {
        orderBy: { id: 'desc' },
        take: 1,
        select: { paymentMethod: true, paymentStatus: true },
      },
    },
  });
}

function toInvoiceOrder(
  order: Awaited<ReturnType<typeof loadOrdersForInvoicePack>>[number],
): InvoiceOrder {
  const payment = order.payments[0];
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    trackingNumber: order.shipments[0]?.trackingNumber?.trim() ?? null,
    paymentMethod: payment?.paymentMethod ?? null,
    paymentStatus: payment?.paymentStatus ?? order.paymentStatus,
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

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const results = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    for (let j = 0; j < results.length; j++) {
      out[i + j] = results[j]!;
    }
  }
  return out;
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
 *
 * Invoices and PostEx AWBs are built in parallel (AWBs batched ≤10 per API call)
 * then interleaved in selection order.
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

  const work: Array<{ order: (typeof rows)[number]; tracking: string }> = [];
  let skipped = 0;
  for (const order of ordered) {
    const tracking = order.shipments[0]?.trackingNumber?.trim();
    if (!tracking) {
      skipped += 1;
      continue;
    }
    work.push({ order, tracking });
  }

  if (work.length === 0) {
    throw new Error('No PostEx tracking numbers on the selected orders — book first');
  }

  const trackingNumbers = work.map((w) => w.tracking);

  // Build Kitchenly invoices and fetch PostEx AWBs at the same time.
  const [invoiceBytesList, awbByTracking] = await Promise.all([
    mapInBatches(work, INVOICE_BUILD_CONCURRENCY, ({ order }) =>
      buildKitchenlyInvoicePdf(toInvoiceOrder(order)),
    ),
    getPostExAirwayBillsByTracking(trackingNumbers),
  ]);

  const merged = await PDFDocument.create();

  for (let i = 0; i < work.length; i++) {
    const tracking = work[i]!.tracking;
    const invoiceBytes = invoiceBytesList[i]!;
    const invoiceDoc = await PDFDocument.load(invoiceBytes);
    for (const page of await merged.copyPages(invoiceDoc, invoiceDoc.getPageIndices())) {
      merged.addPage(page);
    }

    const awbBytes = awbByTracking.get(tracking);
    if (!awbBytes) {
      throw new Error(`PostEx AWB missing for tracking ${tracking}`);
    }
    const awbDoc = await PDFDocument.load(awbBytes);
    for (const page of await merged.copyPages(awbDoc, awbDoc.getPageIndices())) {
      merged.addPage(page);
    }
  }

  return {
    pdf: await merged.save(),
    trackingNumbers,
    skipped,
  };
}
