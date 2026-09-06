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

/** Plain TSV — Name and Qty as separate columns (paste into Sheets / Excel / WhatsApp). */
export function formatPickListPlain(
  lines: ReadonlyArray<PickListLine>,
  meta: { statusLabel: string; orderCount: number },
): string {
  const totalUnits = lines.reduce((sum, line) => sum + line.totalQuantity, 0);
  const header = `Pending items (${meta.statusLabel}) — ${totalUnits} unit${totalUnits === 1 ? '' : 's'} · ${lines.length} line${lines.length === 1 ? '' : 's'} · ${meta.orderCount} order${meta.orderCount === 1 ? '' : 's'}`;

  if (lines.length === 0) return `${header}\n\n(nothing to pack)`;

  const rows = [
    'Name\tQty',
    ...lines.map((line) => `${lineDisplayName(line)}\t${line.totalQuantity}`),
  ];
  return `${header}\n\n${rows.join('\n')}`;
}

/** @deprecated use formatPickListPlain */
export function formatPickList(
  lines: ReadonlyArray<PickListLine>,
  meta: { statusLabel: string; orderCount: number },
): string {
  return formatPickListPlain(lines, meta);
}

/** CORS-friendly thumbnail URL via weserv (embeds cleanly into clipboard HTML). */
function thumbProxyUrl(src: string): string {
  let hostPath: string;
  try {
    const url = new URL(src);
    hostPath = `ssl:${url.host}${url.pathname}${url.search}`;
  } catch {
    hostPath = src.replace(/^https?:\/\//, '');
  }
  const params = new URLSearchParams({
    url: hostPath,
    w: '80',
    h: '80',
    fit: 'cover',
    output: 'jpg',
    q: '70',
  });
  return `https://images.weserv.nl/?${params.toString()}`;
}

async function imageToDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(thumbProxyUrl(src), { mode: 'cors', cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const size = 72;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPickListHtml(
  lines: ReadonlyArray<PickListLine>,
  meta: { statusLabel: string; orderCount: number },
  thumbs: ReadonlyArray<string | null>,
): string {
  const totalUnits = lines.reduce((sum, line) => sum + line.totalQuantity, 0);
  const caption = `Pending items (${escapeHtml(meta.statusLabel)}) — ${totalUnits} units · ${lines.length} lines · ${meta.orderCount} orders`;

  const body = lines
    .map((line, i) => {
      const name = escapeHtml(lineDisplayName(line));
      const qty = line.totalQuantity;
      const dataUrl = thumbs[i];
      const img = dataUrl
        ? `<img src="${dataUrl}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:cover;border-radius:6px;" />`
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
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
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
    const meta = { statusLabel, orderCount };
    const plain = formatPickListPlain(lines, meta);
    start(async () => {
      try {
        toast.message('Preparing thumbnails…');
        const thumbs = await Promise.all(
          lines.map((line) =>
            line.imageUrl ? imageToDataUrl(line.imageUrl) : Promise.resolve(null),
          ),
        );
        const html = formatPickListHtml(lines, meta, thumbs);
        await writeRichClipboard(html, plain);
        setCopied(true);
        const withImages = thumbs.filter(Boolean).length;
        toast.success(
          withImages > 0
            ? `Copied table with ${withImages} image${withImages === 1 ? '' : 's'} — paste into Email, Docs, or Word`
            : 'Copied Name + Qty columns — paste into your message',
        );
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        try {
          await navigator.clipboard.writeText(plain);
          setCopied(true);
          toast.success('Copied Name + Qty as text');
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
