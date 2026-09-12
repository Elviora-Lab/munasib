import 'server-only';

import Stripe from 'stripe';

import { serverEnv } from '@/config/env';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  if (!serverEnv.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  cached = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    appInfo: { name: 'Munasib', version: '0.1.0' },
    typescript: true,
  });
  return cached;
}

/**
 * Create a Stripe PaymentIntent for an order. Returns the client_secret the
 * frontend uses to confirm the payment via Stripe.js.
 */
export async function createPaymentIntent({
  amountMinor,
  currency,
  metadata,
  customerEmail,
}: {
  amountMinor: number; // amount in the smallest currency unit (cents)
  currency: string;
  metadata?: Record<string, string>;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: amountMinor,
    currency: currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata,
    receipt_email: customerEmail,
  });
}

export function verifyStripeWebhook(req: Request, rawBody: string) {
  const stripe = getStripe();
  const sig = req.headers.get('stripe-signature');
  if (!sig || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Missing Stripe signature or webhook secret');
  }
  return stripe.webhooks.constructEvent(rawBody, sig, serverEnv.STRIPE_WEBHOOK_SECRET);
}
