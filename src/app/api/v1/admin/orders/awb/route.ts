import { after } from 'next/server';

import { requireAdmin } from '@/server/auth/guards';
import { createHandler } from '@/server/http/handler';
import { stampPostExLabelsPrintedByTracking } from '@/server/services/fulfillment-print.service';
import { buildAwbsOnlyPdf } from '@/server/shipping/invoice-awb-pack';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * PostEx AWB / shipping labels only (prefers stored awb_pdf).
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
    const { pdf, trackingNumbers } = await buildAwbsOnlyPdf(orderIds);
    after(() => stampPostExLabelsPrintedByTracking(trackingNumbers, session.sub));
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="awb-${trackingNumbers.length}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build AWB labels';
    const status = message.includes('book first') ? 400 : 502;
    return new Response(message, { status });
  }
});
