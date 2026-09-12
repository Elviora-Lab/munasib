import 'server-only';

import { PDFDocument } from 'pdf-lib';

import { prisma } from '@/lib/db';

import { mergeAwbsTiled } from '@/server/shipping/awb-tile';
import {
  buildInvoicePdf,
  type InvoiceOrder,
  prefetchInvoiceImages,
} from '@/server/shipping/invoice-pdf';
import {
  imageCacheFromEmbeddedThumbs,
  invoiceOrderFromSnapshot,
  parseInvoicePrintSnapshot,
  saveShipmentPrintSnapshot,
  snapshotHasEmbeddedThumbs,
} from '@/server/shipping/invoice-print-snapshot';
import { getPostExAirwayBillsByTracking } from '@/server/shipping/postex';
import { readPrintCache, writePrintCache } from '@/server/shipping/print-local-cache';

/** How many Munasib invoices to render at once (images already prefetched). */
const INVOICE_BUILD_CONCURRENCY = 8;

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

type PackWorkItem = {
  orderId: string;
  shipmentId: string;
  tracking: string;
  invoice: InvoiceOrder;
  awbPdf: Uint8Array | null;
};

/**
 * Resolve invoice payloads from `shipments.print_snapshot` (+ embedded thumbs / AWB).
 * Older bookings are backfilled once (thumbs + AWB) on first print.
 */
async function loadPackWork(orderIds: string[]): Promise<{
  work: PackWorkItem[];
  skipped: number;
  fromSnapshot: number;
  backfilled: number;
}> {
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
      awbPdf: true,
    },
  });

  const byOrder = new Map<string, (typeof shipments)[number]>();
  for (const s of shipments) {
    if (!byOrder.has(s.orderId)) byOrder.set(s.orderId, s);
  }

  const work: PackWorkItem[] = [];
  let skipped = 0;
  let fromSnapshot = 0;
  let backfilled = 0;

  for (const orderId of orderIds) {
    const shipment = byOrder.get(orderId);
    const tracking = shipment?.trackingNumber?.trim();
    if (!shipment || !tracking) {
      skipped += 1;
      continue;
    }

    let parsed = parseInvoicePrintSnapshot(shipment.printSnapshot);
    let awbPdf = shipment.awbPdf ? new Uint8Array(shipment.awbPdf) : null;

    if (!parsed || !snapshotHasEmbeddedThumbs(parsed)) {
      parsed = await saveShipmentPrintSnapshot(shipment.id, orderId, tracking, {
        fetchAwb: !awbPdf,
      });
      backfilled += 1;
      const refreshed = await prisma.shipment.findUnique({
        where: { id: shipment.id },
        select: { awbPdf: true },
      });
      awbPdf = refreshed?.awbPdf ? new Uint8Array(refreshed.awbPdf) : awbPdf;
    } else if (!awbPdf) {
      try {
        const map = await getPostExAirwayBillsByTracking([tracking]);
        const bytes = map.get(tracking);
        if (bytes) {
          awbPdf = new Uint8Array(bytes);
          await prisma.shipment.update({
            where: { id: shipment.id },
            data: { awbPdf: Buffer.from(bytes) },
          });
          backfilled += 1;
        }
      } catch {
        // Print path will try again via loadAwbsForWork.
      }
    } else {
      fromSnapshot += 1;
    }

    work.push({
      orderId,
      shipmentId: shipment.id,
      tracking,
      invoice: invoiceOrderFromSnapshot(parsed!),
      awbPdf,
    });
  }

  return { work, skipped, fromSnapshot, backfilled };
}

/** Prefer DB AWB → disk cache → PostEx API. */
async function loadAwbsForWork(work: PackWorkItem[]): Promise<{
  byTracking: Map<string, Uint8Array>;
  dbHits: number;
  fetched: number;
}> {
  const byTracking = new Map<string, Uint8Array>();
  let dbHits = 0;
  const missing: string[] = [];

  for (const item of work) {
    if (item.awbPdf && item.awbPdf.byteLength > 0) {
      byTracking.set(item.tracking, item.awbPdf);
      dbHits += 1;
      continue;
    }
    const disk = await readPrintCache('awb', item.tracking);
    if (disk) {
      byTracking.set(item.tracking, disk);
      continue;
    }
    missing.push(item.tracking);
  }

  let fetched = 0;
  if (missing.length > 0) {
    const map = await getPostExAirwayBillsByTracking(missing);
    for (const [tracking, bytes] of map) {
      byTracking.set(tracking, bytes);
      void writePrintCache('awb', tracking, bytes);
      fetched += 1;
      const row = work.find((w) => w.tracking === tracking);
      if (row) {
        void prisma.shipment
          .update({
            where: { id: row.shipmentId },
            data: { awbPdf: Buffer.from(bytes) },
          })
          .catch(() => undefined);
      }
    }
  }

  return { byTracking, dbHits, fetched };
}

/**
 * One printable PDF: for each booked order, Munasib invoice (with photos)
 * then that order's PostEx airway bill — interleaved so packs stay matched.
 */
export async function buildInvoiceAndPostExAwbPdf(
  orderIds: string[],
): Promise<InvoiceAwbPackResult> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error('No order ids provided');
  }

  const t0 = Date.now();

  const packKey = ids.slice().sort().join(',');
  const cachedPack = await readPrintCache('pack', packKey);
  if (cachedPack) {
    console.info(`[invoice-awb] pack-cache HIT orders=${ids.length} total=${Date.now() - t0}ms`);
    const shipments = await prisma.shipment.findMany({
      where: {
        orderId: { in: ids },
        courierName: 'PostEx',
        trackingNumber: { not: null },
      },
      select: { orderId: true, trackingNumber: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const byOrder = new Map<string, string>();
    for (const s of shipments) {
      const tn = s.trackingNumber?.trim();
      if (tn && !byOrder.has(s.orderId)) byOrder.set(s.orderId, tn);
    }
    const trackingNumbers = ids.map((id) => byOrder.get(id)).filter(Boolean) as string[];
    if (trackingNumbers.length > 0) {
      return { pdf: cachedPack, trackingNumbers, skipped: ids.length - trackingNumbers.length };
    }
  }

  const { work, skipped, fromSnapshot, backfilled } = await loadPackWork(ids);
  const tDb = Date.now();

  if (work.length === 0) {
    throw new Error('No PostEx tracking numbers on the selected orders — book first');
  }

  const trackingNumbers = work.map((w) => w.tracking);
  const invoiceOrders = work.map((w) => w.invoice);

  // Prefer embedded thumbs from snapshot; only fetch URLs still missing.
  const imageCache = imageCacheFromEmbeddedThumbs(invoiceOrders);
  const missingUrls = invoiceOrders
    .flatMap((o) => o.items.map((i) => i.imageUrl))
    .filter((u): u is string => typeof u === 'string' && u.length > 0 && !imageCache.has(u));

  const [fetchedImages, awbLoaded] = await Promise.all([
    missingUrls.length > 0 ? prefetchInvoiceImages(missingUrls) : Promise.resolve(new Map()),
    loadAwbsForWork(work),
  ]);
  for (const [url, img] of fetchedImages) imageCache.set(url, img);
  const tFetch = Date.now();

  const invoiceBytesList = await mapInBatches(
    invoiceOrders,
    INVOICE_BUILD_CONCURRENCY,
    (invoiceOrder) =>
      buildInvoicePdf(invoiceOrder, {
        includeImages: true,
        imageCache,
      }),
  );
  const tInvoices = Date.now();

  const merged = await PDFDocument.create();

  for (let i = 0; i < work.length; i++) {
    const invoiceDoc = await PDFDocument.load(invoiceBytesList[i]!);
    for (const page of await merged.copyPages(invoiceDoc, invoiceDoc.getPageIndices())) {
      merged.addPage(page);
    }

    const tracking = work[i]!.tracking;
    const awbBytes = awbLoaded.byTracking.get(tracking);
    if (!awbBytes) throw new Error(`PostEx AWB missing for tracking ${tracking}`);
    const awbDoc = await PDFDocument.load(awbBytes);
    for (const page of await merged.copyPages(awbDoc, awbDoc.getPageIndices())) {
      merged.addPage(page);
    }
  }

  const pdf = await merged.save();
  void writePrintCache('pack', packKey, pdf);

  console.info(
    `[invoice-awb] orders=${work.length} snapshot=${fromSnapshot} backfill=${backfilled} ` +
      `awbDb=${awbLoaded.dbHits} awbFetch=${awbLoaded.fetched} ` +
      `imgEmbedded=${imageCache.size - fetchedImages.size} imgFetch=${fetchedImages.size} ` +
      `db=${tDb - t0}ms fetch=${tFetch - tDb}ms invoices=${tInvoices - tFetch}ms ` +
      `merge=${Date.now() - tInvoices}ms total=${Date.now() - t0}ms bytes=${pdf.byteLength}`,
  );

  return {
    pdf,
    trackingNumbers,
    skipped,
  };
}

/** Munasib invoices only (no PostEx AWB) — one PDF, orders in selection order. */
export async function buildInvoicesOnlyPdf(orderIds: string[]): Promise<InvoiceAwbPackResult> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) throw new Error('No order ids provided');

  const t0 = Date.now();
  const { work, skipped, fromSnapshot, backfilled } = await loadPackWork(ids);
  if (work.length === 0) {
    throw new Error('No PostEx tracking numbers on the selected orders — book first');
  }

  const trackingNumbers = work.map((w) => w.tracking);
  const invoiceOrders = work.map((w) => w.invoice);
  const imageCache = imageCacheFromEmbeddedThumbs(invoiceOrders);
  const missingUrls = invoiceOrders
    .flatMap((o) => o.items.map((i) => i.imageUrl))
    .filter((u): u is string => typeof u === 'string' && u.length > 0 && !imageCache.has(u));

  const fetchedImages =
    missingUrls.length > 0 ? await prefetchInvoiceImages(missingUrls) : new Map();
  for (const [url, img] of fetchedImages) imageCache.set(url, img);

  const invoiceBytesList = await mapInBatches(
    invoiceOrders,
    INVOICE_BUILD_CONCURRENCY,
    (invoiceOrder) => buildInvoicePdf(invoiceOrder, { includeImages: true, imageCache }),
  );

  const merged = await PDFDocument.create();
  for (const bytes of invoiceBytesList) {
    const invoiceDoc = await PDFDocument.load(bytes!);
    for (const page of await merged.copyPages(invoiceDoc, invoiceDoc.getPageIndices())) {
      merged.addPage(page);
    }
  }

  const pdf = await merged.save();
  console.info(
    `[invoice-only] orders=${work.length} snapshot=${fromSnapshot} backfill=${backfilled} ` +
      `imgEmbedded=${imageCache.size - fetchedImages.size} imgFetch=${fetchedImages.size} ` +
      `total=${Date.now() - t0}ms bytes=${pdf.byteLength}`,
  );

  return { pdf, trackingNumbers, skipped };
}

/** PostEx AWB labels only (prefers stored awb_pdf) — one PDF in selection order. */
export async function buildAwbsOnlyPdf(orderIds: string[]): Promise<InvoiceAwbPackResult> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) throw new Error('No order ids provided');

  const t0 = Date.now();
  const { work, skipped, fromSnapshot, backfilled } = await loadPackWork(ids);
  if (work.length === 0) {
    throw new Error('No PostEx tracking numbers on the selected orders — book first');
  }

  const trackingNumbers = work.map((w) => w.tracking);
  const awbLoaded = await loadAwbsForWork(work);

  const awbPages: Uint8Array[] = [];
  for (const item of work) {
    const awbBytes = awbLoaded.byTracking.get(item.tracking);
    if (!awbBytes) throw new Error(`PostEx AWB missing for tracking ${item.tracking}`);
    awbPages.push(awbBytes);
  }

  // PostEx returns one full A4 per label; crop + stack 3 per sheet.
  const pdf = await mergeAwbsTiled(awbPages);
  console.info(
    `[awb-only] orders=${work.length} snapshot=${fromSnapshot} backfill=${backfilled} ` +
      `awbDb=${awbLoaded.dbHits} awbFetch=${awbLoaded.fetched} tiled=3up ` +
      `total=${Date.now() - t0}ms bytes=${pdf.byteLength}`,
  );

  return { pdf, trackingNumbers, skipped };
}
