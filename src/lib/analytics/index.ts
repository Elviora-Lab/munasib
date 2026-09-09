import { isProd } from '@/config/env';

import { ga, type GaItem } from './google';
import { metaPixel } from './meta-pixel';

/**
 * Unified analytics facade.
 *
 * Every tracked user action calls ONE semantic method here, which fans out to
 * both destinations — the Meta Pixel (`@/lib/analytics/meta-pixel`) and Google
 * Analytics 4 (`@/lib/analytics/google`). Each destination self-guards (no-ops
 * until its script has loaded, production only), so call sites stay clean.
 *
 * The Meta funnel events (ViewContent, ATC, …) share a browser `eventID` with
 * their CAPI twins for dedupe. Purchase is CAPI-only from `placeOrder` — dual
 * Pixel+CAPI Purchase was over-counting in Ads Manager when Meta failed to
 * dedupe. To add another destination later, add it here once.
 */

function redactDevPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(redactDevPayload);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/email|phone/i.test(key)) {
      out[key] = value ? '[redacted]' : value;
    } else {
      out[key] = redactDevPayload(value);
    }
  }
  return out;
}

/** In dev, neither script loads — log the semantic event without contact PII. */
function logDev(event: string, payload?: unknown): void {
  if (isProd || typeof window === 'undefined') return;
  // eslint-disable-next-line no-console
  console.log('[analytics]', event, redactDevPayload(payload) ?? '');
}

/** A fresh event id shared by the browser pixel + its CAPI twin so Meta dedupes
 *  the pair (falls back to a random string on very old browsers). */
function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Relay an event to the server-side Conversions API (`/api/v1/track`), which
 * sends it to Meta with advanced matching from the request (cookies/IP/UA +
 * session). Fire-and-forget with `keepalive` so it survives a navigation; the
 * server no-ops unless CAPI is configured. Production only — the browser pixel
 * is off in dev anyway, so there's nothing to dedupe against.
 */
type CapiEventName =
  | 'ViewContent'
  | 'Search'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Subscribe'
  | 'Lead'
  | 'Contact'
  | 'PushSubscribed'
  | 'HighIntentVisitor'
  | 'CartRecoveryClick'
  | 'CheckoutHesitation';

/**
 * `identity` carries contact details the shopper just typed but that aren't in
 * the session yet — a newsletter email, a quiz email. The server normalizes and
 * hashes them (raw values never leave our own origin), which is what makes an
 * anonymous Lead/Subscribe matchable at all. Logged-in shoppers are enriched
 * server-side from the session, so most call sites pass nothing.
 */
function capiRelay(
  event: CapiEventName,
  eventId: string,
  customData: unknown,
  identity?: { email?: string | null; phone?: string | null },
) {
  if (!isProd || typeof window === 'undefined') return;
  try {
    void fetch('/api/v1/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        eventId,
        eventSourceUrl: window.location.href,
        customData,
        ...(identity?.email ? { email: identity.email } : {}),
        ...(identity?.phone ? { phone: identity.phone } : {}),
      }),
      keepalive: true,
    });
  } catch {
    /* best-effort */
  }
}

function metaContents(
  items: Array<{ item_id: string; price?: number; quantity?: number }> | undefined,
) {
  return items
    ?.filter((i) => i.item_id)
    .map((i) => ({
      id: i.item_id,
      ...(typeof i.quantity === 'number' && Number.isFinite(i.quantity) && i.quantity > 0
        ? { quantity: i.quantity }
        : {}),
      ...(typeof i.price === 'number' && Number.isFinite(i.price) && i.price > 0
        ? { item_price: i.price }
        : {}),
    }));
}

export const analytics = {
  viewItem(p: { id: string; name: string; price: number; currency: string; brand?: string }) {
    logDev('view_item', p);
    const eventId = newEventId();
    // Browser Pixel + GA only. Relaying ViewContent to `/api/v1/track` on every
    // PDP doubled Edge Requests for ads traffic; Match Quality for upper-funnel
    // is good enough from the Pixel + ParamBuilder cookies. Keep CAPI on ATC /
    // checkout / Purchase where conversion quality matters more.
    metaPixel.viewContent(
      { id: p.id, name: p.name, price: p.price, currency: p.currency },
      eventId,
    );
    ga.viewItem(p);
  },

  viewCategory(p: { slug: string; name: string }) {
    logDev('view_category', p);
    metaPixel.viewCategory(p);
    ga.viewCategory(p);
  },

  addToCart(p: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    currency: string;
    variant?: string;
    brand?: string;
    listId?: string;
    listName?: string;
  }) {
    logDev('add_to_cart', p);
    const eventId = newEventId();
    metaPixel.addToCart(
      { id: p.id, name: p.name, quantity: p.quantity, price: p.price, currency: p.currency },
      eventId,
    );
    capiRelay('AddToCart', eventId, {
      value: p.price * p.quantity,
      currency: p.currency,
      content_ids: [p.id],
      contents: [{ id: p.id, quantity: p.quantity, item_price: p.price }],
      content_type: 'product',
    });
    ga.addToCart(p);
  },

  // ---- Product discovery (GA4-only recommended events) --------------------

  viewItemList(p: { listId?: string; listName?: string; items: GaItem[] }) {
    logDev('view_item_list', p);
    ga.viewItemList(p);
  },

  selectItem(p: { listId?: string; listName?: string; item: GaItem }) {
    logDev('select_item', p);
    ga.selectItem(p);
  },

  viewCart(p: { value: number; currency: string; items: GaItem[] }) {
    logDev('view_cart', p);
    ga.viewCart(p);
  },

  removeFromCart(p: { value: number; currency: string; items: GaItem[] }) {
    logDev('remove_from_cart', p);
    ga.removeFromCart(p);
  },

  viewPromotion(p: {
    promotionId?: string;
    promotionName?: string;
    creativeName?: string;
    creativeSlot?: string;
    items?: GaItem[];
  }) {
    logDev('view_promotion', p);
    ga.viewPromotion(p);
  },

  selectPromotion(p: {
    promotionId?: string;
    promotionName?: string;
    creativeName?: string;
    creativeSlot?: string;
    items?: GaItem[];
  }) {
    logDev('select_promotion', p);
    ga.selectPromotion(p);
  },

  // ---- Identity (GA4 user_id / user properties) ---------------------------

  setUser(p: { userId: string | null; properties?: Record<string, string | number> }) {
    logDev('set_user', p.userId);
    ga.setUser(p);
  },

  login(method = 'password') {
    logDev('login', method);
    ga.login(method);
  },

  signUp(method = 'password') {
    logDev('sign_up', method);
    ga.signUp(method);
  },

  /** Attach Advanced Matching (email/phone) to the browser pixel — call once
   *  the shopper's contact details are known (e.g. at checkout). */
  identify(p: { email?: string | null; phone?: string | null }) {
    logDev('identify', p);
    metaPixel.identify(p);
  },

  addToWishlist(p: { id: string; name?: string; price?: number; currency?: string }) {
    logDev('add_to_wishlist', p);
    const eventId = newEventId();
    metaPixel.addToWishlist(p, eventId);
    capiRelay('AddToWishlist', eventId, {
      ...(typeof p.price === 'number' ? { value: p.price, currency: p.currency ?? 'PKR' } : {}),
      content_ids: [p.id],
      contents: [{ id: p.id, ...(typeof p.price === 'number' ? { item_price: p.price } : {}) }],
      content_type: 'product',
      ...(p.name ? { content_name: p.name } : {}),
    });
    ga.addToWishlist(p);
  },

  beginCheckout(p: {
    value: number;
    currency: string;
    count: number;
    coupon?: string;
    items?: GaItem[];
  }) {
    logDev('begin_checkout', p);
    const eventId = newEventId();
    metaPixel.initiateCheckout(
      {
        value: p.value,
        currency: p.currency,
        items: p.count,
        contents: metaContents(p.items),
      },
      eventId,
    );
    capiRelay('InitiateCheckout', eventId, {
      value: p.value,
      currency: p.currency,
      num_items: p.count,
      content_type: 'product',
      ...(p.items?.length ? { content_ids: p.items.map((i) => i.item_id) } : {}),
      ...(p.items?.length ? { contents: metaContents(p.items) } : {}),
    });
    ga.beginCheckout({ value: p.value, currency: p.currency, coupon: p.coupon, items: p.items });
  },

  /** GA4 `add_shipping_info` — the delivery step of the checkout funnel. */
  addShippingInfo(p: {
    value: number;
    currency: string;
    shippingTier?: string;
    coupon?: string;
    items?: GaItem[];
  }) {
    logDev('add_shipping_info', p);
    ga.addShippingInfo(p);
  },

  addPaymentInfo(p: {
    value: number;
    currency: string;
    method: string;
    coupon?: string;
    items?: GaItem[];
  }) {
    logDev('add_payment_info', p);
    // Browser event + deduped server-side CAPI twin (shared eventId), matching
    // the AddToCart / InitiateCheckout pattern so checkout tracking is
    // consistent end-to-end and Meta counts the pair once.
    const eventId = newEventId();
    metaPixel.addPaymentInfo(
      {
        value: p.value,
        currency: p.currency,
        method: p.method,
        contents: metaContents(p.items),
      },
      eventId,
    );
    capiRelay('AddPaymentInfo', eventId, {
      value: p.value,
      currency: p.currency,
      content_type: 'product',
      ...(p.items?.length ? { content_ids: p.items.map((i) => i.item_id) } : {}),
      ...(p.items?.length ? { contents: metaContents(p.items) } : {}),
    });
    ga.addPaymentInfo(p);
  },

  purchase(p: {
    orderId: string;
    value: number;
    currency: string;
    count: number;
    tax?: number;
    shipping?: number;
    coupon?: string;
    items?: GaItem[];
  }) {
    logDev('purchase', p);
    // Meta Purchase is sent server-side only (CAPI from placeOrder) with
    // event_id = order.id. Firing the browser Pixel Purchase as well was
    // double-counting in Ads Manager when Meta failed to dedupe the pair —
    // ~117% of real orders. GA4 still fires here; it dedupes on transaction_id.
    ga.purchase({
      orderId: p.orderId,
      value: p.value,
      currency: p.currency,
      tax: p.tax,
      shipping: p.shipping,
      coupon: p.coupon,
      items: p.items,
    });
  },

  /** GA4 `refund` — full order refund (omit items) or partial (pass items). */
  refund(p: { orderId: string; value?: number; currency?: string; items?: GaItem[] }) {
    logDev('refund', p);
    ga.refund(p);
  },

  search(query: string) {
    logDev('search', query);
    const eventId = newEventId();
    // Pixel + GA only — Search is high-volume catalog traffic; skip CAPI relay.
    metaPixel.search(query, eventId);
    ga.search(query);
  },

  couponApplied(code: string) {
    logDev('coupon_applied', code);
    metaPixel.couponApplied(code);
    ga.couponApplied(code);
  },

  /** `email` is the address just submitted — passed to CAPI so an otherwise
   *  anonymous subscriber is still matchable (and Lookalike-seedable). */
  newsletterSignup(p?: { email?: string | null }) {
    logDev('newsletter_signup', p);
    const eventId = newEventId();
    if (p?.email) metaPixel.identify({ email: p.email });
    metaPixel.subscribe(undefined, eventId);
    capiRelay('Subscribe', eventId, undefined, { email: p?.email });
    ga.newsletterSignup();
  },

  backInStockNotify(productId: string) {
    logDev('back_in_stock_notify', productId);
    metaPixel.backInStockNotify(productId);
    ga.backInStockNotify(productId);
  },

  skincareAssistant() {
    logDev('skincare_assistant');
    metaPixel.skincareAssistant();
    ga.skincareAssistant();
  },

  /** Meta Lead — a captured lead (e.g. the skin-quiz email). Attaches Advanced
   *  Matching from the email so the Lead scores high Event Match Quality and the
   *  person is retargetable / Lookalike-seedable. */
  lead(p?: { email?: string | null; contentName?: string }) {
    logDev('lead', p);
    const eventId = newEventId();
    if (p?.email) metaPixel.identify({ email: p.email });
    metaPixel.lead(p?.contentName ? { content_name: p.contentName } : undefined, eventId);
    capiRelay('Lead', eventId, p?.contentName ? { content_name: p.contentName } : undefined, {
      email: p?.email,
    });
  },

  contact() {
    logDev('contact');
    const eventId = newEventId();
    metaPixel.contact(eventId);
    capiRelay('Contact', eventId, undefined);
    ga.contact();
  },

  pushSubscribed() {
    logDev('push_subscribed');
    const eventId = newEventId();
    metaPixel.pushSubscribed(eventId);
    capiRelay('PushSubscribed', eventId, {
      content_name: 'web_push_subscription',
      status: 'granted',
    });
  },

  highIntentVisitor(p: { score: number; reason: string }) {
    logDev('high_intent_visitor', p);
    const eventId = newEventId();
    metaPixel.highIntentVisitor(p, eventId);
    capiRelay('HighIntentVisitor', eventId, p);
  },
};

export type { GaItem };
