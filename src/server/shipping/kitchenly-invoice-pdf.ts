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
      lower.includes('.jpeg')
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

async function fetchImage(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('webp')) return null; // pdf-lib cannot embed WebP
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 2_500_000) return null;
    return { bytes: buf, contentType };
  } catch {
    return null;
  }
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
  page.drawText(text, { x, y, size, font, color });
}

/**
 * Build a Kitchenly invoice PDF (one or more A4 pages) with product thumbnails.
 */
export async function buildKitchenlyInvoicePdf(order: InvoiceOrder): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    const logoBytes = await readFile(path.join(process.cwd(), 'public/logo.png'));
    logo = await doc.embedPng(logoBytes);
  } catch {
    logo = null;
  }

  // Pre-fetch line images (prefer non-webp URLs already chosen by caller).
  const thumbs: Array<PDFImage | null> = [];
  for (const line of order.items) {
    if (!line.imageUrl) {
      thumbs.push(null);
      continue;
    }
    const fetched = await fetchImage(line.imageUrl);
    if (!fetched) {
      thumbs.push(null);
      continue;
    }
    thumbs.push(await embedImage(doc, fetched.bytes, fetched.contentType, line.imageUrl));
  }

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

  // Payment callout — COD amount to collect, or prepaid method.
  const isCod = order.paymentMethod === 'COD';
  const paymentLine = isCod
    ? `Cash on Delivery — ${money(order.totalAmount, order.currency)}`
    : order.paymentStatus === 'PAID'
      ? `Paid · ${order.paymentMethod ?? 'Prepaid'}`
      : `Payment · ${order.paymentMethod ?? order.paymentStatus}`;
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
    .join(' · ');
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
    const title = [line.productName, line.variantName].filter(Boolean).join(' · ');
    const label = line.quantity > 1 ? `${line.quantity}× ${title}` : title;
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
      display = `${display.slice(0, -2)}…`;
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
    summaryRows.push({ label, value: `−${money(discount, order.currency)}` });
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
