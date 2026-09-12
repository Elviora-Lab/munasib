import { after } from 'next/server';

import { requireAdmin } from '@/server/auth/guards';
import { createHandler } from '@/server/http/handler';
import { stampPostExLabelsPrintedByTracking } from '@/server/services/fulfillment-print.service';
import { buildInvoiceAndPostExAwbPdf } from '@/server/shipping/invoice-awb-pack';

export const runtime = 'nodejs';
/** Per-order invoice images + PostEx AWB fetch — allow time for bulk packs. */
export const maxDuration = 120;

/**
 * Munasib invoice (with product photos) + PostEx airway bill, interleaved
 * per order: invoice → AWB → invoice → AWB …
 * Admin-only. Query: ?ids=uuid,uuid
 */
export const GET = createHandler(async (req) => {
  const session = await requireAdmin(req);

  const raw = new URL(req.url).searchParams.get('ids');
  const orderIds = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (orderIds.length === 0) {
    return new Response('Missing order ids', { status: 400 });
  }
  if (orderIds.length > 100) {
    return new Response('Too many orders (max 100)', { status: 400 });
  }

  try {
    const { pdf, trackingNumbers } = await buildInvoiceAndPostExAwbPdf(orderIds);
    // Stamp after the PDF is returned — don't block print on the DB write.
    after(() => stampPostExLabelsPrintedByTracking(trackingNumbers, session.sub));
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-awb-${trackingNumbers.length}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build invoice + AWB pack';
    const status = message.includes('book first') ? 400 : 502;
    return new Response(message, { status });
  }
});
