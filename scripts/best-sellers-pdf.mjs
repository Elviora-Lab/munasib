/**
 * Best-sellers research PDF from local DB (thumbnail + name + units/revenue).
 *
 *   node scripts/best-sellers-pdf.mjs
 *
 * Writes: exports/<brand-slug>-bestsellers-YYYY-MM-DD.pdf
 *
 * Reads DATABASE_URL from .env.local/.env (same precedence as prisma/seed-blog.ts)
 * rather than a hardcoded local DB name, so it keeps working across DB moves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/munasib';
const BRAND_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'Munasib';
const BRAND_SLUG = BRAND_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const LIMIT = 25;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const THUMB = 72;
const ROW_H = 92;

function money(n) {
  return `Rs ${Math.round(Number(n)).toLocaleString('en-PK')}`;
}

function shopifyThumb(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('shopify.com')) {
      u.searchParams.set('width', '160');
      u.searchParams.set('format', 'jpg');
      return u.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}

async function fetchThumb(url) {
  if (!url) return null;
  const candidates = [shopifyThumb(url), url];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'image/*,*/*' },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const jpeg = await sharp(buf).rotate().resize(160, 160, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
      return new Uint8Array(jpeg);
    } catch {
      /* try next */
    }
  }
  return null;
}

function queryTopProducts() {
  const sql = `
COPY (
  SELECT
    p.name,
    p.slug,
    COALESCE(SUM(oi.quantity), 0)::int AS units,
    COALESCE(SUM(oi.total_price), 0)::numeric(12,2) AS revenue,
    COUNT(DISTINCT oi.order_id)::int AS orders,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.is_primary DESC, pi.sort_order ASC
      LIMIT 1
    ) AS image_url
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN products p ON p.id = oi.product_id
  WHERE o.order_status NOT IN ('CANCELLED')
    AND oi.product_id IS NOT NULL
  GROUP BY p.id, p.name, p.slug
  ORDER BY units DESC, revenue DESC
  LIMIT ${LIMIT}
) TO STDOUT WITH (FORMAT csv, HEADER true, FORCE_QUOTE *);
`;
  const csv = execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const lines = csv.trim().split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // naive CSV for quoted fields
    const cols = [];
    let cur = '';
    let inQ = false;
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (inQ) {
        if (ch === '"' && line[j + 1] === '"') {
          cur += '"';
          j++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        cols.push(cur);
        cur = '';
      } else cur += ch;
    }
    cols.push(cur);
    rows.push({
      name: cols[0],
      slug: cols[1],
      units: Number(cols[2]),
      revenue: Number(cols[3]),
      orders: Number(cols[4]),
      imageUrl: cols[5] || null,
    });
  }
  return rows;
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

async function main() {
  const products = queryTopProducts();
  if (products.length < 20) {
    console.warn(`Only ${products.length} products found (wanted ≥20)`);
  }
  console.log(`Building PDF for top ${products.length} products…`);

  const thumbs = await Promise.all(
    products.map(async (p, i) => {
      process.stdout.write(`  thumb ${i + 1}/${products.length}\r`);
      return fetchThumb(p.imageUrl);
    }),
  );
  console.log('\nEmbedding…');

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const outDir = path.join(process.cwd(), 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${BRAND_SLUG}-bestsellers-${dateLabel}.pdf`);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawHeader = () => {
    page.drawText(`${BRAND_NAME} · Best sellers`, {
      x: MARGIN,
      y: y - 18,
      size: 18,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });
    page.drawText(`Local dump research · ranked by units sold · ${dateLabel}`, {
      x: MARGIN,
      y: y - 36,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 56;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.8,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 16;
  };

  drawHeader();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (y < MARGIN + ROW_H) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader();
    }

    const rowTop = y;
    const thumbBytes = thumbs[i];
    let img = null;
    if (thumbBytes) {
      try {
        img = await doc.embedJpg(thumbBytes);
      } catch {
        img = null;
      }
    }

    // Rank badge
    const rank = String(i + 1);
    page.drawText(rank.padStart(2, '0'), {
      x: MARGIN,
      y: rowTop - 28,
      size: 14,
      font: fontBold,
      color: rgb(0.55, 0.35, 0.15),
    });

    const thumbX = MARGIN + 36;
    const thumbY = rowTop - THUMB;
    page.drawRectangle({
      x: thumbX,
      y: thumbY,
      width: THUMB,
      height: THUMB,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 0.5,
    });
    if (img) {
      page.drawImage(img, { x: thumbX, y: thumbY, width: THUMB, height: THUMB });
    }

    const textX = thumbX + THUMB + 14;
    const textMax = PAGE_W - MARGIN - textX;
    const nameLines = wrapText(p.name, fontBold, 11, textMax);
    let ty = rowTop - 16;
    for (const line of nameLines) {
      page.drawText(line, {
        x: textX,
        y: ty,
        size: 11,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      ty -= 14;
    }
    page.drawText(`${p.units} units  ·  ${p.orders} orders  ·  ${money(p.revenue)} revenue`, {
      x: textX,
      y: ty - 4,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    page.drawText(p.slug, {
      x: textX,
      y: ty - 18,
      size: 7.5,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });

    y -= ROW_H;
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: PAGE_W - MARGIN, y: y + 12 },
      thickness: 0.4,
      color: rgb(0.92, 0.92, 0.92),
    });
  }

  // Summary footer on last page
  const totalUnits = products.reduce((s, p) => s + p.units, 0);
  const totalRev = products.reduce((s, p) => s + p.revenue, 0);
  if (y < MARGIN + 48) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }
  y -= 8;
  page.drawText(
    `Top ${products.length} products · ${totalUnits} units · ${money(totalRev)} combined revenue (excl. cancelled orders)`,
    {
      x: MARGIN,
      y: Math.max(MARGIN, y - 10),
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    },
  );

  const bytes = await doc.save();
  fs.writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath} (${bytes.length} bytes, ${doc.getPageCount()} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
