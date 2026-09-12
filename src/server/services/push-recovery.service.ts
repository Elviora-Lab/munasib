import 'server-only';

import { publicEnv } from '@/config/env';

import { prisma } from '@/lib/db';

import { fcmEnabled, isDeadFcmTokenCode, sendFcmPush } from '@/server/marketing/fcm';

const MIN_IDLE_MINUTES = 30;
const MAX_CART_AGE_HOURS = 48;

function minutesAgo(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function recoveryUrl(visitorId: string): string {
  const to = encodeURIComponent('/cart');
  return `${publicEnv.NEXT_PUBLIC_SITE_URL}/api/v1/push/click?kind=cart_recovery&v=${visitorId}&to=${to}`;
}

export const pushRecoveryService = {
  async sweepAbandonedCarts(now: Date = new Date()) {
    if (!fcmEnabled()) return { scanned: 0, sent: 0, skipped: 'FCM is not configured' };

    const idleBefore = minutesAgo(now, MIN_IDLE_MINUTES);
    const staleAfter = hoursAgo(now, MAX_CART_AGE_HOURS);
    // Active token is the source of truth. Do not require notificationPermission
    // === 'granted' — that field was getting reset to `default` on cart events.
    // Still skip explicit denies.
    const visitors = await prisma.marketingVisitor.findMany({
      where: {
        pushSubscribedAt: { not: null },
        cartId: { not: null },
        pushTokens: { some: { isActive: true } },
        NOT: { notificationPermission: 'denied' },
      },
      include: {
        pushTokens: {
          where: { isActive: true },
          orderBy: { lastSeenAt: 'desc' },
          take: 2,
        },
      },
      take: 200,
    });

    let scanned = 0;
    let sent = 0;

    for (const visitor of visitors) {
      if (!visitor.cartId || visitor.pushTokens.length === 0) continue;
      scanned += 1;

      const cart = await prisma.cart.findUnique({
        where: { id: visitor.cartId },
        include: {
          items: {
            include: {
              product: {
                select: { name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } },
              },
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) continue;
      if (cart.updatedAt > idleBefore || cart.updatedAt < staleAfter) continue;

      const alreadySent = await prisma.visitorEventLog.findFirst({
        where: {
          visitorId: visitor.id,
          eventName: 'CartRecoveryPushSent',
          createdAt: { gte: cart.updatedAt },
        },
        select: { id: true },
      });
      if (alreadySent) continue;

      const first = cart.items[0];
      if (!first) continue;
      const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      const title = itemCount > 1 ? `${itemCount} items are waiting` : 'Your cart is waiting';
      const body =
        itemCount > 1
          ? `Complete your Munasib order before these items sell out.`
          : `${first.product.name} is still saved in your cart.`;
      const icon = first.product.images[0]?.imageUrl;

      let delivered = false;
      let deliveredTokenId: string | null = null;
      const attemptedTokenIds: string[] = [];
      const prunedTokenIds: string[] = [];
      const failureCodes: string[] = [];

      for (const token of visitor.pushTokens) {
        attemptedTokenIds.push(token.id);
        const result = await sendFcmPush({
          token: token.token,
          title,
          body,
          url: recoveryUrl(visitor.id),
          icon,
          data: {
            kind: 'cart_recovery',
            cart_id: cart.id,
          },
        });

        if (result.delivered) {
          delivered = true;
          deliveredTokenId = token.id;
          break;
        }

        if (result.code) failureCodes.push(result.code);
        if (isDeadFcmTokenCode(result.code)) {
          prunedTokenIds.push(token.id);
          await prisma.webPushToken.updateMany({
            where: { id: token.id },
            data: { isActive: false, revokedAt: now },
          });
        }
      }

      await prisma.visitorEventLog.create({
        data: {
          visitorId: visitor.id,
          guestId: visitor.guestId,
          eventName: delivered ? 'CartRecoveryPushSent' : 'CartRecoveryPushFailed',
          cartId: cart.id,
          scoreDelta: delivered ? 5 : 0,
          metadata: {
            tokenId: deliveredTokenId,
            attemptedTokenIds,
            prunedTokenIds,
            failureCodes,
            itemCount,
            sentAt: now.toISOString(),
          },
        },
      });

      if (delivered) sent += 1;
    }

    return { scanned, sent };
  },
};
