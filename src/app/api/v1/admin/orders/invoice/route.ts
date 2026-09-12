import { requireAdmin } from '@/server/auth/guards';
import { createHandler } from '@/server/http/handler';
import { buildInvoicesOnlyPdf } from '@/server/shipping/invoice-awb-pack';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Munasib invoice PDF(s) only (product photos, no PostEx AWB).
 * Admin-only. Query: ?ids=uuid,uuid
 */
export const GET = createHandler(async (req) => {
  await requireAdmin(req);

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
    const { pdf, trackingNumbers } = await buildInvoicesOnlyPdf(orderIds);
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoices-${trackingNumbers.length}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build invoices';
    const status = message.includes('book first') ? 400 : 502;
    return new Response(message, { status });
  }
});
