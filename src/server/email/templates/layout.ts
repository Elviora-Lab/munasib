import 'server-only';

import { siteConfig } from '@/config/site';

/** Munasib brand tokens — inline styles only (email-client safe). */
export const C = {
  navy: '#0A2E5C',
  ink: '#13293F',
  muted: '#5c6b7a',
  border: '#E1EDE6',
  sand: '#F5FBF8',
  white: '#ffffff',
  ember: '#00B86B',
  success: '#2e7d5b',
  successBg: '#edf7f0',
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type EmailLayoutInput = {
  preheader?: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  footerNote?: string;
};

/** Shared branded wrapper for all Munasib transactional emails. */
export function emailLayout({
  preheader,
  title,
  bodyHtml,
  cta,
  footerNote,
}: EmailLayoutInput): string {
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : '';
  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
        <tr>
          <td style="border-radius:8px;background:${C.ember};">
            <a href="${cta.href}" style="display:inline-block;padding:14px 28px;color:${C.white};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>`
    : '';
  const footerExtra = footerNote
    ? `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">${footerNote}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.sand};">
  ${preheaderBlock}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sand};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.white};border-radius:12px;border:1px solid ${C.border};overflow:hidden;">
          <tr>
            <td style="background:${C.navy};padding:24px 32px;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;letter-spacing:0.14em;text-transform:uppercase;color:${C.white};">${escapeHtml(siteConfig.name)}</p>
              <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.72);">${escapeHtml(siteConfig.tagline)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;line-height:1.25;color:${C.ink};">${escapeHtml(title)}</h1>
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${C.border};background:${C.sand};">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${C.muted};">
                Questions? Reply to this email or reach us at
                <a href="mailto:${siteConfig.contact.email}" style="color:${C.navy};text-decoration:none;">${siteConfig.contact.email}</a>
                · ${siteConfig.contact.phone}
              </p>
              <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${C.muted};">
                Cash on delivery available nationwide ·
                <a href="${siteConfig.url}" style="color:${C.navy};text-decoration:none;">${siteConfig.url.replace(/^https?:\/\//, '')}</a>
              </p>
              ${footerExtra}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${C.ink};">${html}</p>`;
}

export function emailMutedParagraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};">${html}</p>`;
}

export function emailNotice(message: string, tone: 'info' | 'success' = 'info'): string {
  const bg = tone === 'success' ? C.successBg : C.sand;
  const color = tone === 'success' ? C.success : C.ink;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;background:${bg};border-radius:8px;border:1px solid ${C.border};">
    <tr>
      <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:${color};">${message}</td>
    </tr>
  </table>`;
}

export function emailDetailTable(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (row) => `<tr>
        <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.muted};width:38%;vertical-align:top;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${C.ink};font-weight:600;vertical-align:top;">${row.value}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-top:1px solid ${C.border};">${body}</table>`;
}

export type EmailLineItem = { name: string; quantity: number; lineTotal: number };

export function emailLineItemsTable(
  items: EmailLineItem[],
  currency: string,
  formatMoney: (amount: number, currency: string) => string,
): string {
  const rows = items
    .map((item) => {
      const label =
        item.quantity > 1 ? `${escapeHtml(item.name)} × ${item.quantity}` : escapeHtml(item.name);
      return `<tr>
        <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:${C.ink};border-bottom:1px solid ${C.border};">${label}</td>
        <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${C.ink};text-align:right;white-space:nowrap;border-bottom:1px solid ${C.border};">${formatMoney(item.lineTotal, currency)}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
    <tr>
      <td colspan="2" style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};">Your items</td>
    </tr>
    ${rows}
  </table>`;
}

export function emailTotalsTable(
  rows: Array<{ label: string; value: string; bold?: boolean }>,
): string {
  const body = rows
    .map((row) => {
      const weight = row.bold ? '700' : '400';
      const size = row.bold ? '16px' : '14px';
      return `<tr>
        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${C.muted};">${escapeHtml(row.label)}</td>
        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:${size};font-weight:${weight};color:${C.ink};text-align:right;">${row.value}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;border-top:1px solid ${C.border};padding-top:8px;">${body}</table>`;
}

export function emailSteps(steps: string[]): string {
  const items = steps
    .map(
      (step, i) => `<tr>
        <td style="padding:0 12px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${C.ember};vertical-align:top;width:20px;">${i + 1}.</td>
        <td style="padding:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${C.ink};">${escapeHtml(step)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">${items}</table>`;
}

export function emailBulletList(items: string[]): string {
  const lis = items.map((item) => `<li style="margin:6px 0;">${escapeHtml(item)}</li>`).join('');
  return `<ul style="margin:0 0 16px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:${C.ink};">${lis}</ul>`;
}
