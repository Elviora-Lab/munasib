import { NextResponse } from 'next/server';

import { cronAuthError } from '@/server/http/cron';
import { productPushService } from '@/server/services/product-push.service';
import { stockNotifyService } from '@/server/services/stock-notify.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  const [email, push] = await Promise.all([
    stockNotifyService.sweepRestocked(),
    productPushService.sweepBackInStock(),
  ]);
  return NextResponse.json({ ok: true, email, push });
}
