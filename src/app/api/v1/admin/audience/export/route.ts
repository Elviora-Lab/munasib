import { getSegmentContacts, type SegmentKey } from '@/server/analytics/audience-insights';
import { requireAdmin } from '@/server/auth/guards';
import { createHandler } from '@/server/http/handler';

export const runtime = 'nodejs';

/**
 * Custom Audience export. Streams a CSV of a segment's contacts (email + phone)
 * for upload to Meta Ads → Audiences → Create Custom Audience → Customer list.
 * Meta hashes the identifiers on its side. Admin-only.
 */

const VALID: SegmentKey[] = [
  'purchasers',
  'atc_no_purchase',
  'wishlist',
  'viewers',
  'quiz',
  'subscribers',
];

export const GET = createHandler(async (req) => {
  await requireAdmin(req);

  const segment = new URL(req.url).searchParams.get('segment');
  if (!segment || !VALID.includes(segment as SegmentKey)) {
    return new Response('Unknown segment', { status: 400 });
  }

  const rows = await getSegmentContacts(segment as SegmentKey);
  // email/phone never contain commas, so a plain CSV is safe.
  const csv = ['email,phone', ...rows.map((r) => `${r.email},${r.phone ?? ''}`)].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="munasib-audience-${segment}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
