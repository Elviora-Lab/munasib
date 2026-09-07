'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

import { publicEnv, serverEnv } from '@/config/env';

import { prisma } from '@/lib/db';

import { withAction } from './_with-action';

import {
  gaTrackPurchase,
  sessionIdFromGaSessionCookie,
} from '@/server/analytics/ga-measurement-protocol';
import {
  applyCapiCookies,
  resolveCapiBrowserParams,
  sendCapiEvent,
} from '@/server/analytics/meta-capi';
import { getSession } from '@/server/auth/get-session';
import { getOrCreateGuestId } from '@/server/auth/guest-session';
import { BadRequestError } from '@/server/http/errors';
import { clientIpFromAction, enforceRateLimit } from '@/server/http/rate-limit';
import { createPaymentIntent } from '@/server/payments/stripe';
import { addressesService } from '@/server/services/addresses.service';
import { ordersService } from '@/server/services/orders.service';
import { isPostExDeliveryCity } from '@/server/shipping/postex';
import { addressBody } from '@/server/validators/addresses.schema';

const placeOrderInput = z.object({
  /** Either an existing address id (logged-in users)… */
  addressId: z.string().uuid().optional(),
  /** …or a new address payload (the guest checkout path). */
  address: addressBody.optional(),
  /** Guest contact email — optional; used for the confirmation email/receipt. */
  email: z.string().email().max(255).optional(),
  // BANK_TRANSFER remains in the DB enum for historical orders but is no
  // longer offered at checkout.
  paymentMethod: z
    .nativeEnum(PaymentMethod)
    .refine((m) => m !== PaymentMethod.BANK_TRANSFER, 'Bank transfer is no longer available'),
  notes: z.string().max(500).optional(),
  couponCode: z.string().min(1).max(64).optional(),
});

/** Read the last-touch UTM cookie (set client-side by `UtmCapture`) so the order
 *  carries its marketing attribution. Best-effort — never blocks checkout. */
async function readUtmCookie(): Promise<
  { source: string | null; medium: string | null; campaign: string | null } | undefined
> {
  try {
    const raw = (await cookies()).get('elv_utm')?.value;
    if (!raw) return undefined;
    const p = JSON.parse(decodeURIComponent(raw)) as { s?: string; m?: string; c?: string };
    return { source: p.s || null, medium: p.m || null, campaign: p.c || null };
  } catch {
    return undefined;
  }
}

/**
 * Place an order from the user's server-side cart.
 *
 * Resolves (or creates) the shipping address, calls `ordersService.createFromCart`
 * (which already wraps stock decrement + cart clear in a single tx), and
 * records the chosen payment method as a PENDING payment row. Stripe charges
 * are reconciled by the webhook handler at /api/v1/webhooks/stripe.
 */
export const placeOrder = withAction(async (raw: unknown) => {
  // Guest checkout: no login required. A logged-in session is still honoured
  // (saved addresses / account order history) when present.
  const session = await getSession();
  const sessionId = await getOrCreateGuestId();
  const input = placeOrderInput.parse(raw);

  // Guest checkout is unauthenticated — throttle per IP against order spam.
  await enforceRateLimit({
    key: `checkout:${await clientIpFromAction()}`,
    limit: 5,
    windowSeconds: 300,
  });

  // Resolve the shipping address. Logged-in users may pick a saved address;
  // everyone else supplies one inline. Phone is required, email optional.
  let shippingAddress: {
    fullName: string;
    phone?: string | null;
    country: string;
    city: string;
    area?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    postalCode?: string | null;
  };
  if (input.addressId && session) {
    shippingAddress = await addressesService.getOwned(input.addressId, session.sub);
  } else if (input.address) {
    if (!input.address.phone) throw new BadRequestError('A phone number is required');
    if (!(await isPostExDeliveryCity(input.address.city))) {
      throw new BadRequestError('Please select a valid PostEx delivery city');
    }
    // Persist to the account when logged in; guests just use the payload.
    shippingAddress = session
      ? await addressesService.create(session.sub, input.address)
      : input.address;
  } else {
    throw new BadRequestError('Provide a shipping address');
  }

  // Find the cart: by user when logged in, else by guest session. We only need
  // the id here; the order service will read the items inside its transaction
  // and clear the cart atomically, preventing duplicate orders from concurrent
  // checkout requests.
  const cart = await prisma.cart.findFirst({
    where: session ? { userId: session.sub } : { sessionId },
    select: { id: true },
  });
  if (!cart) {
    throw new BadRequestError('Your bag is empty');
  }

  const contactEmail = input.email ?? session?.email ?? null;
  const utm = await readUtmCookie();

  const order = await ordersService.createFromCart({
    userId: session?.sub ?? null,
    sessionId,
    cartId: cart.id,
    email: contactEmail,
    notes: input.notes,
    couponCode: input.couponCode,
    paymentMethod: input.paymentMethod,
    shippingAddress: {
      fullName: shippingAddress.fullName,
      phone: shippingAddress.phone ?? null,
      country: shippingAddress.country,
      city: shippingAddress.city,
      area: shippingAddress.area ?? null,
      addressLine1: shippingAddress.addressLine1,
      addressLine2: shippingAddress.addressLine2 ?? null,
      postalCode: shippingAddress.postalCode ?? null,
    },
    utm,
  });

  // The PENDING payment row was created inside the order transaction
  // (ordersService.createFromCart) — an order can never exist without one.
  // Fetch it here only to stamp the Stripe PaymentIntent id below.

  // For card payments, open a Stripe PaymentIntent and return its client_secret
  // so the browser can confirm the charge. `metadata.orderId` is what the Stripe
  // webhook reads to reconcile the order; the PI id is stored as the payment's
  // transactionId so refunds can be matched back. Non-card methods (COD/bank)
  // skip this and are settled by an operator.
  let clientSecret: string | null = null;
  if (input.paymentMethod === PaymentMethod.CARD && serverEnv.STRIPE_SECRET_KEY) {
    const intent = await createPaymentIntent({
      amountMinor: Math.round(Number(order.totalAmount) * 100),
      currency: order.currency,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      customerEmail: contactEmail ?? undefined,
    });
    clientSecret = intent.client_secret;
    await prisma.payment.updateMany({
      where: { orderId: order.id, paymentStatus: 'PENDING', transactionId: null },
      data: { transactionId: intent.id },
    });
  }

  // `order.created` is emitted once by ordersService.createFromCart — do not
  // re-emit here, or every order would trigger its side effects twice.

  // Meta Conversions API: server-side Purchase, deduplicated against the browser
  // Purchase via event_id = order.id. Match keys (fbc/fbp/IP + hashed PII) go
  // through the Parameter Builder. Request APIs are read up front (unavailable
  // inside after()); the HTTP call runs after the response.
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    const browser = resolveCapiBrowserParams({
      host: headerStore.get('x-forwarded-host') ?? headerStore.get('host'),
      cookies: cookieStore,
      referer: headerStore.get('referer'),
      xForwardedFor: headerStore.get('x-forwarded-for'),
      remoteAddress: headerStore.get('x-real-ip'),
    });
    await applyCapiCookies(browser.cookiesToSet);

    const [firstName, ...rest] = (shippingAddress.fullName ?? '').trim().split(/\s+/);
    const contentIds = order.items
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));
    const contents = order.items
      .filter((i) => i.productId)
      .map((i) => ({
        id: i.productId as string,
        quantity: i.quantity,
        item_price: Number(i.unitPrice),
      }));
    const capiEvent = {
      eventName: 'Purchase',
      eventId: order.id,
      eventSourceUrl: `${publicEnv.NEXT_PUBLIC_SITE_URL}/checkout/success/${order.id}`,
      userData: {
        email: contactEmail,
        phone: shippingAddress.phone,
        firstName: firstName || null,
        lastName: rest.length ? rest.join(' ') : null,
        city: shippingAddress.city,
        country: shippingAddress.country,
        externalId: session?.sub ?? sessionId,
        clientIp: browser.clientIp,
        userAgent: headerStore.get('user-agent'),
        fbp: browser.fbp,
        fbc: browser.fbc,
      },
      customData: {
        value: Number(order.totalAmount),
        currency: order.currency,
        num_items: order.items.reduce((sum, i) => sum + i.quantity, 0),
        content_type: 'product',
        content_ids: contentIds,
        contents,
      },
    };
    after(async () => {
      try {
        await sendCapiEvent(capiEvent);
      } catch {
        // Tracking must never break checkout.
      }
    });
  } catch {
    // Tracking must never break checkout.
  }

  // GA4 Measurement Protocol: server-side Purchase, deduped against the browser
  // gtag purchase via the shared transaction_id. Best-effort.
  try {
    const cookieStore = await cookies();
    const gaSession = cookieStore.getAll().find((c) => c.name.startsWith('_ga_'))?.value ?? null;
    void gaTrackPurchase(
      {
        orderId: order.id,
        value: Number(order.totalAmount),
        currency: order.currency,
        tax: Number(order.taxAmount),
        shipping: Number(order.shippingFee),
        coupon: input.couponCode,
        items: order.items.map((i) => ({
          item_id: i.productId ?? i.id,
          item_name: i.productName,
          ...(i.variantName ? { item_variant: i.variantName } : {}),
          price: Number(i.unitPrice),
          quantity: i.quantity,
        })),
      },
      {
        gaCookie: cookieStore.get('_ga')?.value ?? null,
        sessionId: sessionIdFromGaSessionCookie(gaSession),
        userId: session?.sub ?? null,
      },
    );
  } catch {
    // Tracking must never break checkout.
  }

  revalidatePath('/account/orders');
  return { orderId: order.id, orderNumber: order.orderNumber, clientSecret };
});
