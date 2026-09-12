import { prisma } from '@/lib/db';

import { requireAdmin } from '@/server/auth/guards';
import { createHandler } from '@/server/http/handler';
import { prefetchInvoiceImages } from '@/server/shipping/invoice-pdf';
import {
  parseInvoicePrintSnapshot,
  saveShipmentPrintSnapshot,
} from '@/server/shipping/invoice-print-snapshot';
import { getPostExAirwayBillsByTracking } from '@/server/shipping/postex';
import { readPrintCache, writePrintCache } from '@/server/shipping/print-local-cache';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Warm local/disk caches for Invoice+AWB (AWB PDFs + product thumbs) so the
 * actual print click is mostly assemble-from-cache. Admin-only.
 * Body: { ids: string[] }
 */
export const POST = createHandler(async (req) => {
  await requireAdmin(req);

  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
  const orderIds = [...new Set((body?.ids ?? []).filter(Boolean))].slice(0, 100);
  if (orderIds.length === 0) {
    return Response.json({ ok: true, awbFetched: 0, images: 0 });
  }

  const shipments = await prisma.shipment.findMany({
    where: {
      orderId: { in: orderIds },
      courierName: 'PostEx',
      trackingNumber: { not: null },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      orderId: true,
      trackingNumber: true,
      printSnapshot: true,
    },
  });

  const byOrder = new Map<string, (typeof shipments)[number]>();
  for (const s of shipments) {
    if (!byOrder.has(s.orderId)) byOrder.set(s.orderId, s);
  }

  const trackings: string[] = [];
  const imageUrls: string[] = [];

  for (const orderId of orderIds) {
    const shipment = byOrder.get(orderId);
    const tracking = shipment?.trackingNumber?.trim();
    if (!shipment || !tracking) continue;
    trackings.push(tracking);

    let parsed = parseInvoicePrintSnapshot(shipment.printSnapshot);
    if (!parsed) {
      parsed = await saveShipmentPrintSnapshot(shipment.id, orderId, tracking);
    }
    for (const line of parsed.invoice.items) {
      if (line.imageUrl) imageUrls.push(line.imageUrl);
    }
  }

  const uniqueTrackings = [...new Set(trackings)];
  const missing: string[] = [];
  for (const t of uniqueTrackings) {
    const hit = await readPrintCache('awb', t);
    if (!hit) missing.push(t);
  }

  let awbFetched = 0;
  if (missing.length > 0) {
    const fetched = await getPostExAirwayBillsByTracking(missing);
    for (const [tracking, bytes] of fetched) {
      await writePrintCache('awb', tracking, bytes);
      awbFetched += 1;
    }
  }

  const imageCache = await prefetchInvoiceImages(imageUrls);

  return Response.json({
    ok: true,
    orders: orderIds.length,
    trackings: uniqueTrackings.length,
    awbCached: uniqueTrackings.length - missing.length,
    awbFetched,
    images: imageCache.size,
  });
});
