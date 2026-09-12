import 'server-only';

import { siteConfig } from '@/config/site';

import { prisma } from '@/lib/db';

import { events } from './bus';

import { analyticsServer } from '@/server/analytics';
import { sendEmail } from '@/server/email';
import {
  formatShippingAddressHtml,
  orderConfirmationEmail,
} from '@/server/email/templates/order-confirmation';
import { welcomeEmail } from '@/server/email/templates/welcome';
import { notifyUser } from '@/server/notifications';

/** Order fields the fulfilment emails need, with the guest-email fallback. */
async function orderRecipient(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      userId: true,
      paymentStatus: true,
      shippingEmail: true,
      user: { select: { email: true } },
      shipments: {
        orderBy: { shippedAt: 'desc' },
        take: 1,
        select: { courierName: true, trackingNumber: true },
      },
    },
  });
  if (!order) return null;
  return { ...order, email: order.shippingEmail ?? order.user?.email };
}

// Registration guard on globalThis so listeners attach exactly once per
// process even if this module is evaluated in more than one bundle context.
const globalForListeners = globalThis as unknown as { __munasibListenersReady?: boolean };

const publicOrderUrl = (orderId: string) => `${siteConfig.url}/checkout/success/${orderId}`;

/**
 * Wire domain-event listeners exactly once per server instance. Invoked from
 * `instrumentation.ts` at startup. Handlers are best-effort — the bus catches
 * and logs rejections, so a failing side effect never breaks the request that
 * emitted the event.
 *
 * IMPORTANT: this is an in-process EventEmitter. On serverless it only fires
 * within the same invocation and offers no delivery guarantee. Only NON-CRITICAL
 * side effects belong here (welcome email, analytics, in-app notifications).
 * Critical, must-not-be-lost effects — payment reconciliation, order-state
 * transitions — are handled synchronously in their service/route, not via this
 * bus (see the Stripe webhook, which updates order state directly).
 */
export function registerEventListeners() {
  if (globalForListeners.__munasibListenersReady) return;
  globalForListeners.__munasibListenersReady = true;

  events.on('user.registered', async ({ email, name }) => {
    const { subject, html } = welcomeEmail({ name });
    await sendEmail({ to: email, subject, html });
  });

  events.on('product.viewed', async ({ productId, userId }) => {
    await analyticsServer.productView(productId, userId);
    if (userId) await analyticsServer.recordRecentlyViewed(userId, productId);
  });

  events.on('cart.line.added', async ({ productId, variantId, userId }) => {
    await analyticsServer.cartAdd(productId, variantId, userId);
  });

  events.on('order.created', async ({ orderId, userId, total, currency }) => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        subtotal: true,
        shippingFee: true,
        shippingFullName: true,
        shippingEmail: true,
        shippingAddressLine1: true,
        shippingAddressLine2: true,
        shippingArea: true,
        shippingCity: true,
        shippingPostalCode: true,
        discountAmount: true,
        discountLabel: true,
        items: {
          select: { productName: true, quantity: true, totalPrice: true },
          orderBy: { productName: 'asc' },
        },
        payments: { select: { paymentMethod: true }, take: 1, orderBy: { id: 'desc' } },
        user: { select: { email: true } },
      },
    });
    if (!order) return;

    if (userId) {
      await notifyUser({
        userId,
        type: 'ORDER_UPDATE',
        title: 'Order received',
        message: `We've received order ${order.orderNumber}.`,
      });
    }

    // Prefer the email entered at checkout; fall back to the account email.
    const recipient = order.shippingEmail ?? order.user?.email;
    if (recipient) {
      const { subject, html, text } = orderConfirmationEmail({
        orderNumber: order.orderNumber,
        orderUrl: publicOrderUrl(orderId),
        total,
        currency,
        subtotal: Number(order.subtotal),
        shippingFee: Number(order.shippingFee),
        savings: Number(order.discountAmount),
        savingsLabel: order.discountLabel,
        customerName: order.shippingFullName,
        shippingAddress: formatShippingAddressHtml({
          fullName: order.shippingFullName,
          line1: order.shippingAddressLine1,
          line2: order.shippingAddressLine2,
          area: order.shippingArea,
          city: order.shippingCity,
          postalCode: order.shippingPostalCode,
        }),
        isCod: order.payments[0]?.paymentMethod === 'COD',
        items: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          lineTotal: Number(item.totalPrice),
        })),
      });
      await sendEmail({ to: recipient, subject, html, text });
    }
  });

  events.on('order.paid', async ({ orderId }) => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, orderNumber: true },
    });
    if (!order?.userId) return;
    await notifyUser({
      userId: order.userId,
      type: 'ORDER_UPDATE',
      title: 'Payment confirmed',
      message: `Payment for order ${order.orderNumber} was received. Thank you!`,
    });
  });

  events.on('order.shipped', async ({ orderId }) => {
    const order = await orderRecipient(orderId);
    if (!order) return;
    const shipment = order.shipments[0];
    if (order.userId) {
      await notifyUser({
        userId: order.userId,
        type: 'ORDER_UPDATE',
        title: 'Order shipped',
        message: `Order ${order.orderNumber} is on its way${
          shipment?.trackingNumber ? ` — tracking ${shipment.trackingNumber}` : ''
        }.`,
      });
    }
    // Shipped / delivered / cancelled emails are paused for now — only
    // order-placement confirmation emails go out.
  });

  events.on('order.delivered', async ({ orderId }) => {
    const order = await orderRecipient(orderId);
    if (!order) return;
    if (order.userId) {
      await notifyUser({
        userId: order.userId,
        type: 'ORDER_UPDATE',
        title: 'Order delivered',
        message: `Order ${order.orderNumber} has been delivered. Enjoy!`,
      });
    }
    // Delivered emails paused with shipped/cancelled — placement only for now.
  });

  events.on('order.cancelled', async ({ orderId }) => {
    const order = await orderRecipient(orderId);
    if (!order) return;
    if (order.userId) {
      await notifyUser({
        userId: order.userId,
        type: 'ORDER_UPDATE',
        title: 'Order cancelled',
        message: `Order ${order.orderNumber} was cancelled.`,
      });
    }
    // Cancelled emails paused with shipped/delivered — placement only for now.
  });
}
