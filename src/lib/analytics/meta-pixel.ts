import { isProd, publicEnv } from '@/config/env';

import { normalizeCurrencyCode } from '@/lib/currency';

/**
 * Meta (Facebook) Pixel — thin client-side wrapper around `window.fbq`.
 *
 * The base code is injected once by `<MetaPixel />` (see
 * `@/components/analytics/meta-pixel`). These helpers fire standard events from
 * anywhere in the app; early calls are queued until the pixel base snippet has
 * created `window.fbq`, so product events don't disappear during hydration.
 * Calls only run in production, so call sites don't need their own guards.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export const FB_PIXEL_ID = publicEnv.NEXT_PUBLIC_FB_PIXEL_ID;

/** "true" ⇒ add diagnostics in production only. Never enables local tracking. */
export const pixelDebug = publicEnv.NEXT_PUBLIC_FB_PIXEL_DEBUG === 'true';

/**
 * Load the pixel only when an ID is configured AND this is a production
 * environment. Local development must never load the real Meta script: the
 * browser pixel has no test mode, so any localhost event would hit production
 * Meta infrastructure.
 */
export const pixelEnabled = Boolean(FB_PIXEL_ID) && isProd;

type PixelParams = Record<string, unknown>;

/** Optional opts — `eventID` pairs a browser event with its server (CAPI)
 * counterpart so Meta deduplicates the two. */
type TrackOpts = { eventID?: string };

type PixelContent = {
  id: string;
  quantity?: number;
  item_price?: number;
};

type QueuedPixelCall =
  | { kind: 'track'; event: string; params?: PixelParams; opts?: TrackOpts }
  | { kind: 'trackCustom'; event: string; params?: PixelParams; opts?: TrackOpts }
  | { kind: 'identify'; em?: string; ph?: string };

const MAX_QUEUED_PIXEL_CALLS = 50;
let queuedPixelCalls: QueuedPixelCall[] = [];

function fbqReady(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

function enqueuePixelCall(call: QueuedPixelCall): void {
  if (!pixelEnabled || typeof window === 'undefined') return;
  queuedPixelCalls.push(call);
  if (queuedPixelCalls.length > MAX_QUEUED_PIXEL_CALLS) queuedPixelCalls.shift();
}

function runPixelCall(call: QueuedPixelCall): void {
  if (!fbqReady()) return;
  if (call.kind === 'track') {
    if (call.opts?.eventID) {
      window.fbq?.('track', call.event, call.params, { eventID: call.opts.eventID });
    } else {
      window.fbq?.('track', call.event, call.params);
    }
    return;
  }
  if (call.kind === 'trackCustom') {
    if (call.opts?.eventID) {
      window.fbq?.('trackCustom', call.event, call.params, { eventID: call.opts.eventID });
    } else {
      window.fbq?.('trackCustom', call.event, call.params);
    }
    return;
  }
  window.fbq?.('init', FB_PIXEL_ID, {
    ...(call.em ? { em: call.em } : {}),
    ...(call.ph ? { ph: call.ph } : {}),
  });
}

export function flushQueuedPixelEvents(): void {
  if (!pixelEnabled || !fbqReady() || queuedPixelCalls.length === 0) return;
  const calls = queuedPixelCalls;
  queuedPixelCalls = [];
  calls.forEach(runPixelCall);
}

export function fbTrack(event: string, params?: PixelParams, opts?: TrackOpts): void {
  if (!pixelEnabled || typeof window === 'undefined') return;
  const call: QueuedPixelCall = { kind: 'track', event, params, opts };
  if (!fbqReady()) {
    enqueuePixelCall(call);
    return;
  }
  flushQueuedPixelEvents();
  runPixelCall(call);
}

/** Fire a custom (non-standard) event via `trackCustom`. */
export function fbTrackCustom(event: string, params?: PixelParams, opts?: TrackOpts): void {
  if (!pixelEnabled || typeof window === 'undefined') return;
  const call: QueuedPixelCall = { kind: 'trackCustom', event, params, opts };
  if (!fbqReady()) {
    enqueuePixelCall(call);
    return;
  }
  flushQueuedPixelEvents();
  runPixelCall(call);
}

// Advanced matching is applied at most once per (email, phone) pair so a
// repeated call (e.g. re-selecting a payment method) doesn't re-init the pixel.
let lastMatchKey = '';

/**
 * Attach Advanced Matching to the browser pixel. Passing raw email/phone to
 * `fbq('init', …)` lets fbq normalize + SHA-256 them client-side, which lifts
 * Event Match Quality on every subsequent browser event this session. The
 * server (CAPI) sends the same identifiers hashed, so the two dedupe cleanly.
 * No-ops until the pixel has loaded (production only).
 */
export function fbIdentify(user: { email?: string | null; phone?: string | null }): void {
  if (!pixelEnabled || typeof window === 'undefined') return;
  const em = user.email?.trim().toLowerCase() || undefined;
  const ph = user.phone?.replace(/[^0-9]/g, '') || undefined;
  if (!em && !ph) return;
  const key = `${em ?? ''}|${ph ?? ''}`;
  if (key === lastMatchKey) return;
  lastMatchKey = key;
  const call: QueuedPixelCall = { kind: 'identify', em, ph };
  if (!fbqReady()) {
    enqueuePixelCall(call);
    return;
  }
  flushQueuedPixelEvents();
  runPixelCall(call);
}

/**
 * Meta requires `value` to be a positive number whenever it's present. Emit
 * `value` + `currency` together only when the amount is finite and > 0 (a free
 * item or a 0-total order otherwise sends `value: 0`, which Meta rejects);
 * otherwise omit both.
 */
function moneyFields(
  value: number | undefined,
  currency: string | undefined,
): Record<string, unknown> {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? { value, currency: normalizeCurrencyCode(currency) }
    : {};
}

function contentRows(contents: PixelContent[]): PixelContent[] {
  return contents
    .filter((c) => c.id)
    .map((c) => ({
      id: c.id,
      ...(typeof c.quantity === 'number' && Number.isFinite(c.quantity) && c.quantity > 0
        ? { quantity: c.quantity }
        : {}),
      ...(typeof c.item_price === 'number' && Number.isFinite(c.item_price) && c.item_price > 0
        ? { item_price: c.item_price }
        : {}),
    }));
}

function catalogFields(contents: PixelContent[]): Record<string, unknown> {
  const rows = contentRows(contents);
  if (rows.length === 0) return {};
  return {
    content_ids: rows.map((c) => c.id),
    content_type: 'product',
    contents: rows,
  };
}

export const metaPixel = {
  pageView: () => fbTrack('PageView'),

  viewContent: (
    p: { id: string; name: string; price: number; currency: string },
    eventID?: string,
  ) =>
    fbTrack(
      'ViewContent',
      {
        ...catalogFields([{ id: p.id, item_price: p.price }]),
        content_name: p.name,
        ...moneyFields(p.price, p.currency),
      },
      eventID ? { eventID } : undefined,
    ),

  viewCategory: (p: { slug: string; name: string }) =>
    fbTrackCustom('ViewCategory', { content_category: p.name, content_ids: [p.slug] }),

  addToCart: (
    p: { id: string; name: string; quantity: number; price: number; currency: string },
    eventID?: string,
  ) =>
    fbTrack(
      'AddToCart',
      {
        ...catalogFields([{ id: p.id, quantity: p.quantity, item_price: p.price }]),
        content_name: p.name,
        ...moneyFields(p.price * p.quantity, p.currency),
      },
      eventID ? { eventID } : undefined,
    ),

  addToWishlist: (
    p: { id: string; name?: string; price?: number; currency?: string },
    eventID?: string,
  ) =>
    fbTrack(
      'AddToWishlist',
      {
        ...catalogFields([{ id: p.id, item_price: p.price }]),
        ...(p.name ? { content_name: p.name } : {}),
        ...moneyFields(p.price, p.currency),
      },
      eventID ? { eventID } : undefined,
    ),

  initiateCheckout: (
    p: { value: number; currency: string; items: number; contents?: PixelContent[] },
    eventID?: string,
  ) =>
    fbTrack(
      'InitiateCheckout',
      {
        ...moneyFields(p.value, p.currency),
        num_items: p.items,
        ...(p.contents?.length ? catalogFields(p.contents) : {}),
      },
      eventID ? { eventID } : undefined,
    ),

  addPaymentInfo: (
    p: { value: number; currency: string; method: string; contents?: PixelContent[] },
    eventID?: string,
  ) =>
    fbTrack(
      'AddPaymentInfo',
      {
        ...moneyFields(p.value, p.currency),
        payment_method: p.method,
        ...(p.contents?.length ? catalogFields(p.contents) : {}),
      },
      eventID ? { eventID } : undefined,
    ),

  /** Purchase — pass the order id as `eventID` so the browser event dedupes
   * against the server-side Conversions API Purchase. */
  purchase: (p: {
    orderId: string;
    value: number;
    currency: string;
    items: number;
    contents?: PixelContent[];
  }) =>
    fbTrack(
      'Purchase',
      {
        ...moneyFields(p.value, p.currency),
        num_items: p.items,
        content_type: 'product',
        ...(p.contents?.length ? catalogFields(p.contents) : {}),
      },
      { eventID: p.orderId },
    ),

  subscribe: (p?: { value?: number; currency?: string }, eventID?: string) =>
    fbTrack('Subscribe', moneyFields(p?.value, p?.currency), eventID ? { eventID } : undefined),

  /** Attach Advanced Matching (raw email/phone) to lift Event Match Quality. */
  identify: (user: { email?: string | null; phone?: string | null }) => fbIdentify(user),

  contact: (eventID?: string) => fbTrack('Contact', undefined, eventID ? { eventID } : undefined),

  lead: (p?: { content_name?: string }, eventID?: string) =>
    fbTrack('Lead', p ? { content_name: p.content_name } : {}, eventID ? { eventID } : undefined),

  search: (query: string, eventID?: string) =>
    fbTrack('Search', { search_string: query }, eventID ? { eventID } : undefined),

  // Store-specific custom events (build Custom Conversions on these in Ads Manager).
  couponApplied: (code: string) => fbTrackCustom('CouponApplied', { coupon: code }),
  pushSubscribed: (eventID?: string) =>
    fbTrackCustom(
      'PushSubscribed',
      { content_name: 'web_push_subscription', status: 'granted' },
      eventID ? { eventID } : undefined,
    ),
  highIntentVisitor: (p: { score: number; reason: string }, eventID?: string) =>
    fbTrackCustom('HighIntentVisitor', p, eventID ? { eventID } : undefined),
  backInStockNotify: (productId: string) =>
    fbTrackCustom('BackInStockNotify', { content_ids: [productId], content_type: 'product' }),
  skincareAssistant: () => fbTrackCustom('SkincareAssistant'),
};
