import 'server-only';

import { prisma } from '@/lib/db';

/**
 * Stamp labelPrintedAt for PostEx shipments by tracking number.
 * Idempotent — skips rows that already have labelPrintedAt.
 */
export async function stampPostExLabelsPrintedByTracking(
  trackingNumbers: string[],
  printedBy: string | null,
): Promise<number> {
  const list = [...new Set(trackingNumbers.map((t) => t.trim()).filter(Boolean))];
  if (list.length === 0) return 0;
  const result = await prisma.shipment.updateMany({
    where: {
      courierName: 'PostEx',
      trackingNumber: { in: list },
      labelPrintedAt: null,
    },
    data: {
      labelPrintedAt: new Date(),
      ...(printedBy ? { labelPrintedBy: printedBy } : {}),
    },
  });
  return result.count;
}

/**
 * Stamp labelPrintedAt for any shipments on the given orders.
 * Idempotent — skips rows that already have labelPrintedAt.
 */
export async function stampLabelsPrintedForOrders(
  orderIds: string[],
  printedBy: string | null,
): Promise<number> {
  const list = [...new Set(orderIds.filter(Boolean))];
  if (list.length === 0) return 0;
  const result = await prisma.shipment.updateMany({
    where: {
      orderId: { in: list },
      trackingNumber: { not: null },
      labelPrintedAt: null,
    },
    data: {
      labelPrintedAt: new Date(),
      ...(printedBy ? { labelPrintedBy: printedBy } : {}),
    },
  });
  return result.count;
}
