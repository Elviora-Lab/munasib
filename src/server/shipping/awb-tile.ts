import 'server-only';

import {
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  PDFDocument,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib';

/** A4 (points). */
const PAGE_W = 595.28;
const PAGE_H = 841.89;

/**
 * PostEx AWB PDFs are full A4 pages, but the printed label only occupies the
 * top ~252pt. Crop to that band and stack several per sheet.
 */
const CROP_H = 280;
const LABELS_PER_PAGE = 3;
const GAP = 6;
const MARGIN_X = 12;
const MARGIN_Y = 10;

/**
 * Merge PostEx AWB PDFs into an A4 pack with 3 labels per page
 * (cropped to the real label band — not scaled-down full pages).
 */
export async function mergeAwbsTiled(awbPdfs: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  let slot = 0;
  let page: PDFPage | null = null;

  for (const bytes of awbPdfs) {
    if (!bytes?.byteLength) continue;
    const src = await PDFDocument.load(bytes);
    for (const pageIndex of src.getPageIndices()) {
      const emb = await out.embedPage(src.getPage(pageIndex));
      if (slot % LABELS_PER_PAGE === 0) {
        page = out.addPage([PAGE_W, PAGE_H]);
      }
      drawCroppedLabel(page!, emb, slot % LABELS_PER_PAGE);
      slot += 1;
    }
  }

  if (slot === 0) {
    throw new Error('No AWB pages to merge');
  }

  return out.save();
}

function drawCroppedLabel(
  page: PDFPage,
  emb: Awaited<ReturnType<PDFDocument['embedPage']>>,
  indexOnPage: number,
) {
  const usableH = PAGE_H - 2 * MARGIN_Y - (LABELS_PER_PAGE - 1) * GAP;
  const cellH = usableH / LABELS_PER_PAGE;
  const cellW = PAGE_W - 2 * MARGIN_X;
  const scale = Math.min(cellW / PAGE_W, cellH / CROP_H);
  const drawW = PAGE_W * scale;
  const drawH = PAGE_H * scale;
  const x = MARGIN_X + (cellW - drawW) / 2;
  const cellTop = PAGE_H - MARGIN_Y - indexOnPage * (cellH + GAP);
  const clipH = CROP_H * scale;
  const clipBottom = cellTop - clipH;
  const yDraw = cellTop - drawH;

  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, clipBottom),
    lineTo(x + drawW, clipBottom),
    lineTo(x + drawW, cellTop),
    lineTo(x, cellTop),
    closePath(),
    clip(),
    endPath(),
  );
  page.drawPage(emb, { x, y: yDraw, width: drawW, height: drawH });
  page.pushOperators(popGraphicsState());

  if (indexOnPage < LABELS_PER_PAGE - 1) {
    const sepY = cellTop - cellH - GAP / 2;
    page.drawLine({
      start: { x: MARGIN_X, y: sepY },
      end: { x: PAGE_W - MARGIN_X, y: sepY },
      thickness: 0.4,
      color: rgb(0.75, 0.75, 0.75),
    });
  }
}
