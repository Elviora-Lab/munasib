'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { displayVariant, shadeLabel } from './variant-label';

/** Readable in-cell thumbnail size for Sheets/Excel =IMAGE(..., 4, w, h). */
const THUMB_PX = 120;

export type PickListLine = {
  productName: string;
  variantName: string | null;
  sku: string | null;
  size: string | null;
  shade: string | null;
  fragrance: string | null;
  totalQuantity: number;
  imageUrl?: string | null;
};

export function lineDisplayName(line: PickListLine): string {
  const details = [
    line.size,
    shadeLabel(line.shade),
    line.fragrance,
    !line.size && !line.shade && !line.fragrance ? displayVariant(line.variantName) : null,
  ]
    .filter((part): part is string => Boolean(part) && part !== '—')
    .join(' · ');

  const name = details ? `${line.productName} (${details})` : line.productName;
  // Avoid tabs/newlines so TSV columns stay aligned when pasting into Sheets.
  return (line.sku ? `${name} [${line.sku}]` : name).replace(/[\t\n\r]+/g, ' ').trim();
}

/** Public thumbnail URL Sheets/Excel can fetch for =IMAGE(). */
export function thumbProxyUrl(src: string): string {
  try {
    const url = new URL(src);
    if (url.hostname === 'cdn.shopify.com' || url.hostname.endsWith('.shopify.com')) {
      url.searchParams.set('width', String(THUMB_PX * 2));
      return url.toString();
    }
  } catch {
    /* fall through */
  }

  let hostPath: string;
  try {
    const url = new URL(src);
    hostPath = `ssl:${url.host}${url.pathname}${url.search}`;
  } catch {
    hostPath = src.replace(/^https?:\/\//, '');
  }
  const params = new URLSearchParams({
    url: hostPath,
    w: String(THUMB_PX * 2),
    h: String(THUMB_PX * 2),
    fit: 'cover',
    output: 'jpg',
    q: '80',
  });
  return `https://images.weserv.nl/?${params.toString()}`;
}

/**
 * Fixed-size IMAGE formula (mode 4) so thumbs stay readable even when
 * default row height would crush mode-1 "fit to cell" images.
 */
export function imageFormula(src: string | null | undefined, sizePx = THUMB_PX): string {
  if (!src) return '';
  const url = thumbProxyUrl(src).replace(/"/g, '""');
  return `=IMAGE("${url}",4,${sizePx},${sizePx})`;
}

/** TSV: Image | Name | Qty — paste into A1 in Google Sheets / Excel 365. */
export function formatPickListPlain(lines: ReadonlyArray<PickListLine>): string {
  if (lines.length === 0) return 'Image\tName\tQty';
  return [
    'Image\tName\tQty',
    ...lines.map(
      (line) => `${imageFormula(line.imageUrl)}\t${lineDisplayName(line)}\t${line.totalQuantity}`,
    ),
  ].join('\n');
}

/** @deprecated */
export function formatPickList(lines: ReadonlyArray<PickListLine>): string {
  return formatPickListPlain(lines);
}

async function fetchThumbBytes(src: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(thumbProxyUrl(src), { mode: 'cors', cache: 'force-cache' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function buildPickListWorkbook(lines: ReadonlyArray<PickListLine>) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kitchenly';
  const sheet = workbook.addWorksheet('Pick list', {
    properties: { defaultRowHeight: THUMB_PX + 16 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Image', key: 'image', width: 18 },
    { header: 'Name', key: 'name', width: 56 },
    { header: 'Qty', key: 'qty', width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 24;

  for (const [index, line] of lines.entries()) {
    const rowNumber = index + 2;
    const row = sheet.getRow(rowNumber);
    row.getCell(2).value = lineDisplayName(line);
    row.getCell(3).value = line.totalQuantity;
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    row.height = THUMB_PX + 16;

    if (!line.imageUrl) continue;
    const bytes = await fetchThumbBytes(line.imageUrl);
    if (!bytes) continue;

    const imageId = workbook.addImage({
      buffer: new Uint8Array(bytes) as never,
      extension: 'jpeg',
    });
    sheet.addImage(imageId, {
      tl: { col: 0.1, row: rowNumber - 1 + 0.05 },
      ext: { width: THUMB_PX, height: THUMB_PX },
      editAs: 'oneCell',
    });
  }

  return workbook.xlsx.writeBuffer();
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CopyPickListButton({
  lines,
  statusLabel,
}: {
  lines: PickListLine[];
  statusLabel: string;
  orderCount?: number;
}) {
  const [pendingCopy, startCopy] = useTransition();
  const [pendingDownload, startDownload] = useTransition();
  const [copied, setCopied] = useState(false);

  function onCopy() {
    // Plain text ONLY. Adding text/html makes Google Sheets prefer HTML and
    // drop the Image column (the =IMAGE formulas never land in the sheet).
    const plain = formatPickListPlain(lines);
    startCopy(async () => {
      try {
        await navigator.clipboard.writeText(plain);
        setCopied(true);
        toast.success(
          `Copied 3 columns — click A1, Paste, then set row height to ${THUMB_PX + 10} for readable images`,
          { duration: 6000 },
        );
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        toast.error('Could not copy — check clipboard permission');
      }
    });
  }

  function onDownloadExcel() {
    startDownload(async () => {
      try {
        toast.message('Building Excel with images…');
        const buffer = await buildPickListWorkbook(lines);
        downloadBlob(
          `kitchenly-pick-list-${statusLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`,
          new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        );
        toast.success('Excel ready — images embedded at readable size');
      } catch (error) {
        console.error(error);
        toast.error('Could not build Excel — try Copy instead');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          loading={pendingCopy}
          disabled={lines.length === 0}
          onClick={onCopy}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy list'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={pendingDownload}
          disabled={lines.length === 0}
          onClick={onDownloadExcel}
        >
          <Download className="size-3.5" />
          Download Excel
        </Button>
      </div>
      <p className="max-w-sm text-right text-[11px] text-muted-foreground">
        Copy → click cell A1 → Paste. Then select all rows → Resize row height to {THUMB_PX + 10}.
      </p>
    </div>
  );
}
