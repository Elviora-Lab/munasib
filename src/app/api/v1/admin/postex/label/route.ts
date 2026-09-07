import { requireAdmin } from '@/server/auth/guards';
import { createHandler } from '@/server/http/handler';
import { stampPostExLabelsPrintedByTracking } from '@/server/services/fulfillment-print.service';
import { getPostExAirwayBill } from '@/server/shipping/postex';

export const runtime = 'nodejs';
/** Large selections fetch PostEx in chunks of 10 and merge — allow time for that. */
export const maxDuration = 60;

/**
 * Stream a PostEx Airway Bill (shipping label) PDF for one or more tracking
 * numbers, e.g. /api/v1/admin/postex/label?tracking=CX-123,CX-456.
 * PostEx accepts 10 per request; larger lists are fetched in chunks and merged
 * into one printable PDF. Admin-only.
 */
export const GET = createHandler(async (req) => {
  const session = await requireAdmin(req);

  const raw = new URL(req.url).searchParams.get('tracking');
  const trackingNumbers = (raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (trackingNumbers.length === 0) {
    return new Response('Missing tracking number', { status: 400 });
  }
  if (trackingNumbers.length > 200) {
    return new Response('Too many tracking numbers (max 200)', { status: 400 });
  }

  try {
    const pdf = await getPostExAirwayBill(trackingNumbers);
    await stampPostExLabelsPrintedByTracking(trackingNumbers, session.sub);
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="postex-labels-${trackingNumbers.length}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch label';
    return new Response(message, { status: 502 });
  }
});
