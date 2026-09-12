import 'server-only';

import { siteConfig } from '@/config/site';

import { C, emailLayout, emailParagraph, escapeHtml } from './layout';

export function orderDeliveredEmail({
  orderNumber,
  orderUrl,
  reviewUrl,
}: {
  orderNumber: string;
  orderUrl?: string;
  /** Signed, no-login "leave a review" link (verified purchase). */
  reviewUrl?: string;
}) {
  const subject = `Your ${siteConfig.name} order ${orderNumber} has arrived`;
  const bodyParts = [
    emailParagraph(
      `Order <strong>${escapeHtml(orderNumber)}</strong> has been delivered. We hope everything is exactly as you expected.`,
    ),
    emailParagraph(
      `If something isn't right — wrong item, damage, or a missing piece — reply to this email within our return window and we'll sort it out quickly.`,
    ),
  ];

  if (reviewUrl) {
    bodyParts.push(
      emailParagraph(
        `Enjoyed your purchase? <a href="${reviewUrl}" style="color:${C.navy};font-weight:600;text-decoration:none;">Leave a quick review</a> — it helps other shoppers and takes less than a minute.`,
      ),
    );
  }

  const html = emailLayout({
    preheader: `Order ${orderNumber} delivered — we hope you love it`,
    title: 'Delivered',
    bodyHtml: bodyParts.join(''),
    cta: reviewUrl
      ? { label: 'Leave a review', href: reviewUrl }
      : orderUrl
        ? { label: 'View your order', href: orderUrl }
        : undefined,
  });

  const text = [
    `Your ${siteConfig.name} order ${orderNumber} has been delivered.`,
    'If anything is wrong, reply to this email and we will help.',
    ...(reviewUrl ? [`Leave a review: ${reviewUrl}`] : []),
    ...(orderUrl ? [`View order: ${orderUrl}`] : []),
  ].join('\n');

  return { subject, html, text };
}
