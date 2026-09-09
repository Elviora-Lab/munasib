import { isProd, publicEnv } from '@/config/env';

/**
 * First-party clickstream — pure helpers (no React, no server imports).
 *
 * The browser captures every meaningful link/button click and beacons a batch
 * to `/api/v1/click`, which stamps identity and stores it. This module owns the
 * config flags and the DOM→payload derivation so the wiring component
 * (`@/components/analytics/click-tracker`) stays thin and this stays unit-testable.
 */

export const TARGET_TYPES = ['product', 'nav', 'cta', 'banner', 'link', 'button', 'other'] as const;
export type ClickTargetType = (typeof TARGET_TYPES)[number];

export type ClickPayload = {
  targetType: ClickTargetType;
  targetId?: string;
  label?: string;
  href?: string;
  pagePath: string;
  position?: number;
};

/** Capture runs in production only — the same gate as the Meta Pixel & GA, so
 *  no shopper is ever tracked from a dev/preview build. */
export const clickstreamEnabled = isProd;

/** Optional sampling valve (0–1). Unset/invalid ⇒ 0.15 in prod (cuts Edge
 *  Requests from click beacons). Set `NEXT_PUBLIC_CLICKSTREAM_SAMPLE=1` to
 *  capture every click. */
export const clickstreamSampleRate = (() => {
  const raw = Number(publicEnv.NEXT_PUBLIC_CLICKSTREAM_SAMPLE);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return 0.15;
})();

// Only clicks that resolve to one of these count as "meaningful" — a click on
// bare page chrome/whitespace is ignored so the stream stays signal, not noise.
const SELECTOR = 'a, button, [role="button"], [data-track], [data-product-id]';

/** Back-office prefix. The clickstream measures storefront shopper behaviour, so
 *  activity under /admin (staff using the dashboard) is never recorded. Kept in
 *  sync with the server ingest + dashboard query filters. */
export const ADMIN_PATH_PREFIX = '/admin';

/** False for back-office paths, which are excluded from the clickstream. */
export function isTrackablePath(pathname: string): boolean {
  return !pathname.startsWith(ADMIN_PATH_PREFIX);
}

/** Strip emails + long digit runs so a label can never carry PII. */
export function stripPii(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    .replace(/\d[\d\s-]{6,}\d/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTargetType(v: string | undefined): v is ClickTargetType {
  return !!v && (TARGET_TYPES as readonly string[]).includes(v);
}

/** Same-origin → path only; cross-origin → origin+path. Query/hash always dropped. */
function cleanHref(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw, window.location.origin);
    const base = u.origin === window.location.origin ? u.pathname : `${u.origin}${u.pathname}`;
    return base.slice(0, 512);
  } catch {
    return raw.slice(0, 512);
  }
}

/**
 * Walk up from the clicked node to the nearest meaningful element and derive a
 * storable payload. `data-track*` attributes win over inference so high-value
 * targets self-describe. Returns null when nothing meaningful was clicked.
 */
export function deriveClick(target: EventTarget | null): ClickPayload | null {
  if (!(target instanceof Element)) return null;
  // Skip back-office pages — the clickstream is storefront-only.
  if (!isTrackablePath(window.location.pathname)) return null;
  // Explicit opt-out: anything under a [data-no-track] element is never recorded
  // (e.g. auth buttons — sign in / register / logout). Add the attribute to any
  // element whose clicks you don't want in the stream.
  if (target.closest('[data-no-track]')) return null;
  // `el` is the clickable (for tag/href); `host` is the nearest element carrying
  // tracking metadata — often an ancestor wrapper (e.g. a product-card <article>
  // wrapping its <a>). closest() returns the *nearest*, so a button's own
  // data-track wins over an enclosing card's data-product-id.
  const el = target.closest(SELECTOR);
  if (!(el instanceof HTMLElement)) return null;
  const metaEl = target.closest('[data-track], [data-product-id]');
  const host = metaEl instanceof HTMLElement ? metaEl : el;
  const ds = host.dataset;

  let targetType: ClickTargetType;
  if (isTargetType(ds.track)) targetType = ds.track;
  else if (ds.productId != null) targetType = 'product';
  else if (el.tagName === 'A') targetType = 'link';
  else if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') targetType = 'button';
  else targetType = 'other';

  const targetId = ds.trackId ?? ds.productId;

  const rawLabel = ds.trackLabel ?? el.getAttribute('aria-label') ?? el.textContent ?? '';
  const label = stripPii(rawLabel).slice(0, 160) || undefined;

  const href = el instanceof HTMLAnchorElement ? cleanHref(el.getAttribute('href')) : undefined;

  const idxRaw = ds.index ?? ds.trackPosition;
  const idx = idxRaw != null ? Number.parseInt(idxRaw, 10) : NaN;
  const position = Number.isInteger(idx) && idx >= 0 ? idx : undefined;

  return {
    targetType,
    targetId: targetId?.slice(0, 128),
    label,
    href,
    pagePath: window.location.pathname.slice(0, 512),
    position,
  };
}
