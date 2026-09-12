import { describe, expect, it } from 'vitest';

import { escapeHtml } from '@/server/email/templates/layout';
import { orderConfirmationEmail } from '@/server/email/templates/order-confirmation';
import { orderShippedEmail } from '@/server/email/templates/order-shipped';

describe('email templates', () => {
  it('escapes HTML in user-provided strings', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders order confirmation with line items, COD notice, and plain text', () => {
    const { subject, html, text } = orderConfirmationEmail({
      orderNumber: 'ELV-2026-TEST01',
      orderUrl: 'https://munasib.pk/checkout/success/abc',
      total: 2500,
      currency: 'PKR',
      subtotal: 2400,
      shippingFee: 100,
      savings: 200,
      savingsLabel: 'WELCOME10',
      customerName: 'Shahir',
      shippingAddress: 'Shahir<br/>123 Main St<br/>Lahore',
      isCod: true,
      items: [{ name: 'Storage Jar Set', quantity: 2, lineTotal: 2400 }],
    });

    expect(subject).toContain('ELV-2026-TEST01');
    expect(html).toContain('Munasib');
    expect(html).toContain('Storage Jar Set');
    expect(html).toContain('Cash on delivery');
    expect(html).toContain('WELCOME10');
    expect(html).toContain('View order details');
    expect(text).toContain('Pay Rs');
    expect(text).toContain('Storage Jar Set × 2');
  });

  it('renders shipped email with tracking prominently', () => {
    const { html, text } = orderShippedEmail({
      orderNumber: 'ELV-2026-TEST02',
      orderUrl: 'https://munasib.pk/checkout/success/xyz',
      courierName: 'PostEx',
      trackingNumber: '25711770000005',
    });

    expect(html).toContain('25711770000005');
    expect(html).toContain('PostEx');
    expect(html).toContain("It's on its way");
    expect(text).toContain('Tracking: 25711770000005');
  });
});
