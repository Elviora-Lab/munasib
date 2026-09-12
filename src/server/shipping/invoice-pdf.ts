import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';

import { siteConfig } from '@/config/site';

export type InvoiceLine = {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl: string | null;
  /** Small JPEG embedded at book time — print skips Shopify when set. */
  imageJpegBase64?: string | null;
};

export type InvoiceOrder = {
  orderNumber: string;
  createdAt: Date;
  trackingNumber: string | null;
  paymentMethod: string | null;
  paymentStatus: string;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  discountLabel: string | null;
  totalAmount: number;
  currency: string;
  shippingFullName: string | null;
  shippingPhone: string | null;
  shippingCity: string | null;
  shippingAddressLine1: string | null;
  items: InvoiceLine[];
};

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const ROW_H = 56;
const THUMB = 44;

/** Loaded once per process — every invoice was re-reading public/logo.png. */
let cachedLogoBytes: Uint8Array | null | undefined;

async function loadLogoBytes(): Promise<Uint8Array | null> {
  if (cachedLogoBytes !== undefined) return cachedLogoBytes;
  try {
    cachedLogoBytes = await readFile(path.join(process.cwd(), 'public/logo.png'));
  } catch {
    cachedLogoBytes = null;
  }
  return cachedLogoBytes;
}

function money(amount: number, currency: string): string {
  if (currency === 'PKR') return `Rs ${Math.round(amount).toLocaleString('en-PK')}`;
  return `${currency} ${amount.toFixed(2)}`;
}

async function embedImage(
  doc: PDFDocument,
  bytes: Uint8Array,
  contentType: string | null,
  url: string,
): Promise<PDFImage | null> {
  const type = (contentType ?? '').toLowerCase();
  const lower = url.toLowerCase();
  try {
    if (type.includes('png') || lower.includes('.png')) return await doc.embedPng(bytes);
    if (
      type.includes('jpeg') ||
      type.includes('jpg') ||
      lower.includes('.jpg') ||
      lower.includes('.jpeg') ||
      lower.includes('format=jpg')
    ) {
      return await doc.embedJpg(bytes);
    }
    // Try JPEG then PNG for unknown types (many CDNs omit extension clarity).
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return await doc.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

/**
 * Invoice thumbs are ~44pt on the page — never download catalog masters.
 * Shopify/Cloudinary/Unsplash: native resize. Everything else: weserv → small JPEG
 * (pdf-lib cannot embed WebP, so output=jpg).
 */
export function invoiceThumbUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === 'cdn.shopify.com' || host.endsWith('.shopify.com')) {
      u.searchParams.set('width', '88');
      u.searchParams.set('format', 'jpg');
      return u.toString();
    }
    if (host === 'res.cloudinary.com' && u.pathname.includes('/upload/')) {
      // Avoid stacking transforms if one was already injected.
      if (!/\/upload\/(?:[^/]+,)*w_/.test(u.pathname)) {
        const transform = 'w_88,c_limit,q_65,f_jpg';
        u.pathname = u.pathname.replace('/upload/', `/upload/${transform}/`);
      }
      return u.toString();
    }
    if (host === 'images.unsplash.com') {
      u.searchParams.set('w', '88');
      u.searchParams.set('q', '65');
      u.searchParams.set('fm', 'jpg');
      return u.toString();
    }
    // Supabase / misc CDNs — force a tiny JPEG via weserv.
    const params = new URLSearchParams({
      url: `ssl:${u.host}${u.pathname}${u.search}`,
      w: '88',
      output: 'jpg',
      q: '65',
    });
    return `https://images.weserv.nl/?${params.toString()}`;
  } catch {
    return url;
  }
}

export type PrefetchedInvoiceImage = { bytes: Uint8Array; contentType: string | null };

/** Fetch one invoice thumb (small JPEG when the CDN supports it). */
export async function fetchInvoiceImage(url: string): Promise<PrefetchedInvoiceImage | null> {
  const { readPrintCache, writePrintCache } = await import('@/server/shipping/print-local-cache');
  const cached = await readPrintCache('img', url);
  if (cached && cached.byteLength > 0) {
    return { bytes: cached, contentType: 'image/jpeg' };
  }

  const thumb = invoiceThumbUrl(url);
  try {
    const res = await fetch(thumb, {
      signal: AbortSignal.timeout(3_000),
      headers: { Accept: 'image/jpeg,image/png,image/*;q=0.8' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('webp')) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Thumbs should be tiny; reject accidental full-size payloads.
    if (buf.byteLength === 0 || buf.byteLength > 120_000) return null;
    void writePrintCache('img', url, buf);
    return { bytes: buf, contentType };
  } catch {
    return null;
  }
}

/**
 * Prefetch unique product images once per print pack (same SKU across orders
 * shares one download).
 */
export async function prefetchInvoiceImages(
  urls: Array<string | null | undefined>,
): Promise<Map<string, PrefetchedInvoiceImage>> {
  const unique = [...new Set(urls.map((u) => u?.trim()).filter((u): u is string => Boolean(u)))];
  const out = new Map<string, PrefetchedInvoiceImage>();
  let totalBytes = 0;
  await Promise.all(
    unique.map(async (url) => {
      const fetched = await fetchInvoiceImage(url);
      if (fetched) {
        out.set(url, fetched);
        totalBytes += fetched.bytes.byteLength;
      }
    }),
  );
  console.info(
    `[invoice-images] requested=${unique.length} ok=${out.size} bytes=${totalBytes} avg=${out.size ? Math.round(totalBytes / out.size) : 0}`,
  );
  return out;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  color = rgb(0.08, 0.08, 0.08),
) {
  // Helvetica is WinAnsi — normalize common Unicode punctuation so catalog
  // names / discounts never blow up print with "cannot encode".
  const safe = text
    .replace(/[\u2212\u2013\u2014]/g, '-') // minus, en/em dash
    .replace(/[\u00B7\u2022]/g, '-') // middle dot, bullet
    .replace(/\u00D7/g, 'x') // multiplication
    .replace(/\u2026/g, '...') // ellipsis
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x00-\xFF]/g, '?');
  page.drawText(safe, { x, y, size, font, color });
}

/**
 * Build a Munasib invoice PDF (one or more A4 pages) with product thumbnails.
 * Pass a pack-level `imageCache` so duplicate SKUs across orders aren't re-fetched.
 */
export async function buildInvoicePdf(
  order: InvoiceOrder,
  opts?: {
    includeImages?: boolean;
    imageCache?: Map<string, PrefetchedInvoiceImage>;
  },
): Promise<Uint8Array> {
  const includeImages = opts?.includeImages !== false;
  const imageCache = opts?.imageCache;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    const logoBytes = await loadLogoBytes();
    if (logoBytes) logo = await doc.embedPng(logoBytes);
  } catch {
    logo = null;
  }

  const thumbs: Array<PDFImage | null> = includeImages
    ? await Promise.all(
        order.items.map(async (line) => {
          const key = line.imageUrl ?? `embedded:${line.productName}`;
          let fetched = imageCache?.get(key) ?? null;
          if (!fetched && line.imageJpegBase64) {
            try {
              fetched = {
                bytes: Uint8Array.from(Buffer.from(line.imageJpegBase64, 'base64')),
                contentType: 'image/jpeg',
              };
            } catch {
              fetched = null;
            }
          }
          if (!fetched && line.imageUrl) {
            fetched = await fetchInvoiceImage(line.imageUrl);
          }
          if (!fetched) return null;
          return embedImage(doc, fetched.bytes, fetched.contentType, line.imageUrl ?? key);
        }),
      )
    : order.items.map(() => null);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // Header
  if (logo) {
    const logoH = 36;
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: MARGIN, y: y - logoH, width: logoW, height: logoH });
  }
  drawText(page, siteConfig.name, MARGIN + 48, y - 18, 16, fontBold);
  drawText(page, 'Invoice', MARGIN + 48, y - 34, 10, font, rgb(0.4, 0.4, 0.4));

  drawText(
    page,
    order.orderNumber,
    PAGE_W - MARGIN - fontBold.widthOfTextAtSize(order.orderNumber, 12),
    y - 18,
    12,
    fontBold,
  );
  const dateStr = order.createdAt.toISOString().slice(0, 10);
  drawText(
    page,
    dateStr,
    PAGE_W - MARGIN - font.widthOfTextAtSize(dateStr, 9),
    y - 34,
    9,
    font,
    rgb(0.4, 0.4, 0.4),
  );
  if (order.trackingNumber) {
    const trackLabel = `AWB ${order.trackingNumber}`;
    drawText(
      page,
      trackLabel,
      PAGE_W - MARGIN - font.widthOfTextAtSize(trackLabel, 8),
      y - 48,
      8,
      font,
      rgb(0.35, 0.35, 0.35),
    );
  }

  y -= order.trackingNumber ? 66 : 56;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
  y -= 18;

  // Payment callout - COD amount to collect, or prepaid method.
  // Use ASCII-only glyphs: StandardFonts are WinAnsi and reject U+2212 etc.
  const isCod = order.paymentMethod === 'COD';
  const paymentLine = isCod
    ? `Cash on Delivery - ${money(order.totalAmount, order.currency)}`
    : order.paymentStatus === 'PAID'
      ? `Paid - ${order.paymentMethod ?? 'Prepaid'}`
      : `Payment - ${order.paymentMethod ?? order.paymentStatus}`;
  const payBoxPadX = 10;
  const payBoxPadY = 6;
  const paySize = isCod ? 11 : 9;
  const payFont = isCod ? fontBold : font;
  const payW = payFont.widthOfTextAtSize(paymentLine, paySize) + payBoxPadX * 2;
  const payH = paySize + payBoxPadY * 2;
  page.drawRectangle({
    x: MARGIN,
    y: y - payH + 4,
    width: payW,
    height: payH,
    borderColor: rgb(0, 0, 0),
    borderWidth: isCod ? 1.5 : 0.8,
  });
  drawText(page, paymentLine, MARGIN + payBoxPadX, y - payH + 4 + payBoxPadY, paySize, payFont);
  y -= payH + 12;

  if (order.shippingFullName) {
    drawText(page, 'Bill to', MARGIN, y, 8, font, rgb(0.45, 0.45, 0.45));
    y -= 14;
    drawText(page, order.shippingFullName, MARGIN, y, 11, fontBold);
    y -= 13;
  }
  const addr = [order.shippingAddressLine1, order.shippingCity, order.shippingPhone]
    .filter(Boolean)
    .join(' - ');
  if (addr) {
    drawText(page, addr.slice(0, 90), MARGIN, y, 9, font, rgb(0.3, 0.3, 0.3));
    y -= 16;
  }

  y -= 8;
  // Table header
  drawText(page, '#', MARGIN, y, 9, fontBold);
  drawText(page, 'Product', MARGIN + 70, y, 9, fontBold);
  const priceHeader = 'Price';
  drawText(
    page,
    priceHeader,
    PAGE_W - MARGIN - fontBold.widthOfTextAtSize(priceHeader, 9),
    y,
    9,
    fontBold,
  );
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  y -= ROW_H;

  const ensureSpace = (need: number) => {
    if (y < MARGIN + need) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN - 20;
    }
  };

  for (let i = 0; i < order.items.length; i++) {
    ensureSpace(ROW_H + 24);
    const line = order.items[i]!;
    const thumb = thumbs[i];
    const title = [line.productName, line.variantName].filter(Boolean).join(' - ');
    const label = line.quantity > 1 ? `${line.quantity}x ${title}` : title;
    const price = money(
      line.totalPrice > 0 ? line.totalPrice : line.unitPrice * line.quantity,
      order.currency,
    );

    const rowTop = y + THUMB - 8;
    drawText(page, String(i + 1), MARGIN, rowTop - 12, 10, font, rgb(0.35, 0.35, 0.35));

    if (thumb) {
      const scale = Math.min(THUMB / thumb.width, THUMB / thumb.height);
      const w = thumb.width * scale;
      const h = thumb.height * scale;
      page.drawImage(thumb, {
        x: MARGIN + 28,
        y: y,
        width: w,
        height: h,
      });
      page.drawRectangle({
        x: MARGIN + 28,
        y: y,
        width: w,
        height: h,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.5,
      });
    } else {
      page.drawRectangle({
        x: MARGIN + 28,
        y: y,
        width: THUMB,
        height: THUMB,
        color: rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.5,
      });
    }

    const textX = MARGIN + 28 + THUMB + 10;
    const maxTitleWidth = PAGE_W - MARGIN - textX - 90;
    let display = label;
    while (font.widthOfTextAtSize(display, 10) > maxTitleWidth && display.length > 4) {
      display = `${display.slice(0, -2)}...`;
    }
    drawText(page, display, textX, rowTop - 12, 10, font);
    drawText(
      page,
      price,
      PAGE_W - MARGIN - font.widthOfTextAtSize(price, 10),
      rowTop - 12,
      10,
      font,
    );

    y -= 8;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.4,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= ROW_H;
  }

  const linesSubtotal = order.items.reduce((sum, line) => {
    const lineTotal = line.totalPrice > 0 ? line.totalPrice : line.unitPrice * line.quantity;
    return sum + lineTotal;
  }, 0);
  const subtotal = order.subtotal > 0 ? order.subtotal : linesSubtotal;
  const shippingFee = Math.max(0, order.shippingFee);
  const discount = Math.max(0, order.discountAmount);
  const shippingDisplay = shippingFee === 0 ? 'Free' : money(shippingFee, order.currency);

  const summaryRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Subtotal', value: money(subtotal, order.currency) },
    { label: 'Shipping', value: shippingDisplay },
  ];
  if (discount > 0) {
    const label = order.discountLabel?.trim() ? `Discount (${order.discountLabel})` : 'Discount';
    summaryRows.push({ label, value: `-${money(discount, order.currency)}` });
  }
  summaryRows.push({
    label: 'Total',
    value: money(order.totalAmount, order.currency),
    bold: true,
  });

  ensureSpace(24 + summaryRows.length * 18);
  y += ROW_H - 16;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
  y -= 18;

  for (const row of summaryRows) {
    ensureSpace(22);
    const useFont = row.bold ? fontBold : font;
    const size = row.bold ? 12 : 10;
    const valueSize = row.bold ? 13 : 10;
    drawText(page, row.label, MARGIN, y, size, useFont);
    drawText(
      page,
      row.value,
      PAGE_W - MARGIN - useFont.widthOfTextAtSize(row.value, valueSize),
      y,
      valueSize,
      useFont,
    );
    y -= row.bold ? 20 : 16;
  }

  return doc.save();
}
