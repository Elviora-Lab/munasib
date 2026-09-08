'use client';

import { useEffect, useRef } from 'react';

import { analytics, type GaItem } from '@/lib/analytics';

/**
 * Fires GA4 `purchase` once when the order-confirmation page loads.
 *
 * Meta Purchase is intentionally NOT fired here — Conversions API already
 * sends it from `placeOrder` with `event_id = order.id`. Dual Pixel+CAPI
 * Purchase was over-counting in Meta Ads when dedupe failed.
 *
 * sessionStorage guards against success-page refresh double-firing GA.
 */
export function PurchaseTracker({
  orderId,
  value,
  currency,
  items,
  tax,
  shipping,
  coupon,
  lineItems,
}: {
  orderId: string;
  value: number;
  currency: string;
  /** Total quantity across the order (kept for call-site compatibility). */
  items: number;
  tax?: number;
  shipping?: number;
  coupon?: string;
  /** Per-line items for GA4 revenue-by-product. */
  lineItems?: GaItem[];
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    const key = `kitchenly:purchase-tracked:${orderId}`;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
      sessionStorage?.setItem(key, '1');
    } catch {
      /* private mode — fall through with ref-only guard */
    }
    sent.current = true;
    analytics.purchase({
      orderId,
      value,
      currency,
      count: items,
      tax,
      shipping,
      coupon,
      items: lineItems,
    });
  }, [orderId, value, currency, items, tax, shipping, coupon, lineItems]);
  return null;
}
