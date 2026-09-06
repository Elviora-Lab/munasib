'use client';

import { useState, useTransition } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { displayVariant, shadeLabel } from './variant-label';

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

function lineDisplayName(line: PickListLine): string {
  const details = [
    line.size,
    shadeLabel(line.shade),
    line.fragrance,
    !line.size && !line.shade && !line.fragrance ? displayVariant(line.variantName) : null,
  ]
    .filter((part): part is string => Boolean(part) && part !== '—')
    .join(' · ');

  const name = details ? `${line.productName} (${details})` : line.productName;
  return line.sku ? `${name} [${line.sku}]` : name;
}

/**
 * Public thumbnail URL for spreadsheet IMAGE() formulas and HTML paste.
 * Spreadsheets ignore clipboard base64/data-URL images — they need a real https URL
 * (Google Sheets / Excel 365 render =IMAGE("https://…")).
 */
export function thumbProxyUrl(src: string): string {
  try {
    const url = new URL(src);
    // Prefer Shopify's own resize when possible — Sheets can fetch it directly.
    if (url.hostname === 'cdn.shopify.com' || url.hostname.endsWith('.shopify.com')) {
      url.searchParams.set('width', '120');
      return url.toString();
    }
  } catch {
    /* fall through to weserv */
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
    w: '120',
    h: '120',
    fit: 'cover',
    output: 'jpg',
    q: '75',
  });
  return `https://images.weserv.nl/?${params.toString()}`;
}

function imageFormula(src: string | null | undefined): string {
  if (!src) return '';
  const url = thumbProxyUrl(src).replace(/"/g, '""');
  // Google Sheets + Excel 365 show the picture in-cell from this formula.
  return `=IMAGE("${url}")`;
}

/**
 * TSV for spreadsheets: Image | Name | Qty.
 * Image column uses =IMAGE("…") so Sheets/Excel render thumbnails after paste.
 */
export function formatPickListPlain(lines: ReadonlyArray<PickListLine>): string {
  if (lines.length === 0) return 'Image\tName\tQty';

  const rows = [
    'Image\tName\tQty',
    ...lines.map(
      (line) => `${imageFormula(line.imageUrl)}\t${lineDisplayName(line)}\t${line.totalQuantity}`,
    ),
  ];
  return rows.join('\n');
}

/** @deprecated use formatPickListPlain */
export function formatPickList(
  lines: ReadonlyArray<PickListLine>,
  _meta?: { statusLabel: string; orderCount: number },
): string {
  return formatPickListPlain(lines);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML table with https thumbnail URLs (for Docs/Word/email). */
export function formatPickListHtml(
  lines: ReadonlyArray<PickListLine>,
  meta: { statusLabel: string; orderCount: number },
): string {
  const totalUnits = lines.reduce((sum, line) => sum + line.totalQuantity, 0);
  const caption = `Pending items (${escapeHtml(meta.statusLabel)}) — ${totalUnits} units · ${lines.length} lines · ${meta.orderCount} orders`;

  const body = lines
    .map((line) => {
      const name = escapeHtml(lineDisplayName(line));
      const qty = line.totalQuantity;
      const thumb = line.imageUrl ? thumbProxyUrl(line.imageUrl) : null;
      const img = thumb
        ? `<img src="${escapeHtml(thumb)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:cover;border-radius:6px;" />`
        : '';
      return `<tr>
  <td style="padding:8px;border:1px solid #ddd;vertical-align:middle;width:88px;">${img}</td>
  <td style="padding:8px;border:1px solid #ddd;vertical-align:middle;font-family:system-ui,sans-serif;font-size:14px;">${name}</td>
  <td style="padding:8px;border:1px solid #ddd;vertical-align:middle;text-align:right;font-family:system-ui,sans-serif;font-size:16px;font-weight:600;white-space:nowrap;">${qty}</td>
</tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body>
<p style="font-family:system-ui,sans-serif;font-size:13px;color:#555;">${caption}</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;">
  <thead>
    <tr>
      <th style="padding:8px;border:1px solid #ddd;text-align:left;font-family:system-ui,sans-serif;font-size:12px;text-transform:uppercase;color:#666;">Image</th>
      <th style="padding:8px;border:1px solid #ddd;text-align:left;font-family:system-ui,sans-serif;font-size:12px;text-transform:uppercase;color:#666;">Name</th>
      <th style="padding:8px;border:1px solid #ddd;text-align:right;font-family:system-ui,sans-serif;font-size:12px;text-transform:uppercase;color:#666;">Qty</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>
</body></html>`;
}

async function writeRichClipboard(html: string, plain: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    // Prefer plain TSV for spreadsheets (they ignore HTML images / data-URLs).
    // Still attach HTML for Docs/Word/email paste targets.
    const item = new ClipboardItem({
      'text/plain': new Blob([plain], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  await navigator.clipboard.writeText(plain);
}

export function CopyPickListButton({
  lines,
  statusLabel,
  orderCount,
}: {
  lines: PickListLine[];
  statusLabel: string;
  orderCount: number;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function onCopy() {
    const plain = formatPickListPlain(lines);
    const html = formatPickListHtml(lines, { statusLabel, orderCount });
    start(async () => {
      try {
        await writeRichClipboard(html, plain);
        setCopied(true);
        toast.success(
          'Copied Image / Name / Qty — paste into Sheets or Excel (images load via =IMAGE)',
        );
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        try {
          await navigator.clipboard.writeText(plain);
          setCopied(true);
          toast.success('Copied Image / Name / Qty as text');
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Could not copy — check clipboard permission');
        }
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      loading={pending}
      disabled={lines.length === 0}
      onClick={onCopy}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy list'}
    </Button>
  );
}
