import 'server-only';

import { type Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

import { fetchInvoiceImage, type InvoiceOrder } from '@/server/shipping/invoice-pdf';
import { getPostExAirwayBillsByTracking } from '@/server/shipping/postex';

export const PRINT_SNAPSHOT_VERSION = 2 as const;

type SnapshotInvoice = Omit<InvoiceOrder, 'createdAt'> & { createdAt: string };

/** JSON stored on `shipments.print_snapshot` (dates as ISO strings). */
export type InvoicePrintSnapshotV2 = {
  version: typeof PRINT_SNAPSHOT_VERSION;
  invoice: SnapshotInvoice;
};

/** Accept v1 (URLs only) and v2 (URLs + embedded JPEG thumbs). */
export type InvoicePrintSnapshot =
  | InvoicePrintSnapshotV2
  | {
      version: 1;
      invoice: SnapshotInvoice;
    };

/** Prefer JPEG/PNG masters; fall back to WebP (Shopify → format=jpg at print). */
export function pickPdfSafeImage(urls: Array<string | null | undefined>): string | null {
  const clean = urls.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (clean.length === 0) return null;
  return clean.find((u) => !/\.webp(?:$|\?)/i.test(u)) ?? clean[0] ?? null;
}

type OrderForSnapshot = {
  orderNumber: string;
  createdAt: Date;
  paymentStatus: string;
  subtotal: Prisma.Decimal | number;
  shippingFee: Prisma.Decimal | number;
  discountAmount: Prisma.Decimal | number;
  discountLabel: string | null;
  totalAmount: Prisma.Decimal | number;
  currency: string;
  shippingFullName: string | null;
  shippingPhone: string | null;
  shippingCity: string | null;
  shippingAddressLine1: string | null;
  items: Array<{
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal | number;
    totalPrice: Prisma.Decimal | number;
    variant?: { images: Array<{ imageUrl: string }> } | null;
    product?: { images: Array<{ imageUrl: string }> } | null;
  }>;
  payments?: Array<{ paymentMethod: string; paymentStatus: string }>;
};

export function buildInvoicePrintSnapshot(
  order: OrderForSnapshot,
  trackingNumber: string,
): InvoicePrintSnapshotV2 {
  const payment = order.payments?.[0];
  return {
    version: PRINT_SNAPSHOT_VERSION,
    invoice: {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      trackingNumber: trackingNumber.trim(),
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
        imageJpegBase64: null,
      })),
    },
  };
}

/** Download small JPEG thumbs once and embed into the snapshot (no Shopify at print). */
export async function embedThumbsInSnapshot(
  snapshot: InvoicePrintSnapshotV2,
): Promise<InvoicePrintSnapshotV2> {
  const items = await Promise.all(
    snapshot.invoice.items.map(async (item) => {
      if (!item.imageUrl || item.imageJpegBase64) return item;
      const fetched = await fetchInvoiceImage(item.imageUrl);
      if (!fetched) return item;
      return {
        ...item,
        imageJpegBase64: Buffer.from(fetched.bytes).toString('base64'),
      };
    }),
  );
  return { ...snapshot, invoice: { ...snapshot.invoice, items } };
}

export function invoiceOrderFromSnapshot(snapshot: InvoicePrintSnapshot): InvoiceOrder {
  return {
    ...snapshot.invoice,
    createdAt: new Date(snapshot.invoice.createdAt),
  };
}

export function parseInvoicePrintSnapshot(raw: unknown): InvoicePrintSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<InvoicePrintSnapshot>;
  if ((row.version !== 1 && row.version !== 2) || !row.invoice?.orderNumber) return null;
  if (!Array.isArray(row.invoice.items)) return null;
  return row as InvoicePrintSnapshot;
}

export function snapshotHasEmbeddedThumbs(snapshot: InvoicePrintSnapshot): boolean {
  const items = snapshot.invoice.items;
  if (items.length === 0) return true;
  return items.every((i) => !i.imageUrl || Boolean(i.imageJpegBase64));
}

/** Build an imageCache map from embedded JPEG thumbs (keyed by imageUrl). */
export function imageCacheFromEmbeddedThumbs(
  orders: InvoiceOrder[],
): Map<string, { bytes: Uint8Array; contentType: string | null }> {
  const out = new Map<string, { bytes: Uint8Array; contentType: string | null }>();
  for (const order of orders) {
    for (const line of order.items) {
      if (!line.imageUrl || !line.imageJpegBase64 || out.has(line.imageUrl)) continue;
      try {
        out.set(line.imageUrl, {
          bytes: Uint8Array.from(Buffer.from(line.imageJpegBase64, 'base64')),
          contentType: 'image/jpeg',
        });
      } catch {
        // ignore corrupt base64
      }
    }
  }
  return out;
}

/** Include shape used when building a snapshot from live order rows. */
export const invoiceSnapshotOrderInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      variant: {
        select: {
          images: {
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            take: 1,
            select: { imageUrl: true },
          },
        },
      },
      product: {
        select: {
          images: {
            where: { variantId: null },
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            take: 1,
            select: { imageUrl: true },
          },
        },
      },
    },
  },
  payments: {
    orderBy: { id: 'desc' as const },
    take: 1,
    select: { paymentMethod: true, paymentStatus: true },
  },
} satisfies Prisma.OrderInclude;

export type PrintAssets = {
  snapshot: InvoicePrintSnapshotV2;
  awbPdf: Uint8Array | null;
};

/**
 * Build snapshot with embedded thumbs + fetch AWB PDF (best-effort).
 * Used at book time so print is DB-only.
 */
export async function buildPrintAssetsAtBookTime(
  order: OrderForSnapshot,
  trackingNumber: string,
): Promise<PrintAssets> {
  let snapshot = buildInvoicePrintSnapshot(order, trackingNumber);
  snapshot = await embedThumbsInSnapshot(snapshot);

  let awbPdf: Uint8Array | null = null;
  try {
    const map = await getPostExAirwayBillsByTracking([trackingNumber]);
    awbPdf = map.get(trackingNumber.trim()) ?? null;
  } catch {
    awbPdf = null;
  }

  return { snapshot, awbPdf };
}

/**
 * Build + persist print snapshot (+ optional AWB) on a shipment.
 * Used at book time and to backfill older bookings on first print.
 */
export async function saveShipmentPrintSnapshot(
  shipmentId: string,
  orderId: string,
  trackingNumber: string,
  opts?: { fetchAwb?: boolean },
): Promise<InvoicePrintSnapshotV2> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: invoiceSnapshotOrderInclude,
  });

  let snapshot = buildInvoicePrintSnapshot(order, trackingNumber);
  snapshot = await embedThumbsInSnapshot(snapshot);

  const data: Prisma.ShipmentUpdateInput = { printSnapshot: snapshot };

  if (opts?.fetchAwb !== false) {
    try {
      const map = await getPostExAirwayBillsByTracking([trackingNumber]);
      const awb = map.get(trackingNumber.trim());
      if (awb) data.awbPdf = Buffer.from(awb);
    } catch {
      // Keep snapshot even if AWB fetch fails — print can fall back.
    }
  }

  await prisma.shipment.update({
    where: { id: shipmentId },
    data,
  });
  return snapshot;
}
