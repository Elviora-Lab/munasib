import { NextResponse } from 'next/server';

import { cronAuthError } from '@/server/http/cron';
import { syncPostExShipments } from '@/server/services/postex-sync.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reconcile PostEx consignment statuses into our orders. This endpoint is
 * scheduled in vercel.json and can also be triggered manually after a pickup.
 */
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  const result = await syncPostExShipments();
  return NextResponse.json({ ok: true, ...result });
}
