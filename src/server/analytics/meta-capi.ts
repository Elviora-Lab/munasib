import 'server-only';

import { cookies } from 'next/headers';
import { type CookieSettings, ParamBuilder } from 'capi-param-builder-nodejs';

import { isProd, publicEnv, serverEnv } from '@/config/env';

import { normalizeCurrencyCode } from '@/lib/currency';

/**
 * Meta Conversions API (server-side events).
 *
 * Complements the browser pixel: browser events are increasingly blocked, so we
 * also send the important conversions from the server. Each server event shares
 * an `event_id` with its browser counterpart so Meta deduplicates the pair.
 *
 * Match keys (`fbc` / `fbp` / `client_ip_address` / hashed PII) go through Meta's
 * Parameter Builder so values carry the library appendix and follow Meta's
 * formatting rules — lifting Event Match Quality vs hand-rolled cookie/IP reads.
 *
 * No-ops safely unless `META_CAPI_ACCESS_TOKEN` and a pixel id are configured.
 */

const GRAPH_VERSION = 'v21.0';

export function capiEnabled(): boolean {
  // Gate on `isProd` (matching the browser pixel) so local/preview order
  // placements never fire a real server-side Purchase to the production pixel.
  return Boolean(isProd && serverEnv.META_CAPI_ACCESS_TOKEN && publicEnv.NEXT_PUBLIC_FB_PIXEL_ID);
}

// Domain list for ParamBuilder cookie scoping (ETLD+1). Used for both PII
// hashing (stateless) and per-request processRequest (stateful — new instance).
const PB_DOMAINS = (() => {
  try {
    return [new URL(publicEnv.NEXT_PUBLIC_SITE_URL).hostname, 'localhost'];
  } catch {
    return ['localhost'];
  }
})();

/** Shared hasher only — never call processRequest on this instance (races). */
const piiBuilder = new ParamBuilder(PB_DOMAINS);

/**
 * Normalize + SHA-256 a customer-info value via the Parameter Builder. The
 * library returns a Meta-ready `<hash>.<appendix>` string; we send it as-is and
 * NEVER re-hash. `dataType` is Meta's field name (`email`, `phone`,
 * `first_name`, …). Returns undefined for blank input or on any library error
 * (tracking must never throw).
 */
function pii(value: string | null | undefined, dataType: string): string | undefined {
  if (!value) return undefined;
  try {
    return piiBuilder.getNormalizedAndHashedPII(value, dataType) ?? undefined;
  } catch {
    return undefined;
  }
}

export type CapiUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  country?: string | null;
  externalId?: string | null;
  /**
   * Prefer the value from {@link resolveCapiBrowserParams} (includes Meta's
   * appendix). Raw IPs still work but score lower.
   */
  clientIp?: string | null;
  userAgent?: string | null;
  /** From ParamBuilder — do not lowercase or reformat. */
  fbp?: string | null;
  fbc?: string | null;
};

export type CapiBrowserParams = {
  fbp: string | null;
  fbc: string | null;
  /** Best public IPv6/IPv4 from `_fbi` cookie + request, with appendix. */
  clientIp: string | null;
  cookiesToSet: CookieSettings[];
};

type CookieReader =
  | Record<string, string>
  | { get: (name: string) => { value: string } | undefined };

function cookieMapFrom(cookiesIn: CookieReader): Record<string, string> {
  if (typeof (cookiesIn as { get?: unknown }).get === 'function') {
    const store = cookiesIn as { get: (name: string) => { value: string } | undefined };
    const out: Record<string, string> = {};
    for (const name of ['_fbp', '_fbc', '_fbi']) {
      const v = store.get(name)?.value;
      if (v) out[name] = v;
    }
    return out;
  }
  return { ...(cookiesIn as Record<string, string>) };
}

/**
 * Run Meta's server Parameter Builder over the current request so `fbc` / `fbp`
 * / `client_ip_address` are validated, appendix-tagged, and (when needed)
 * generated from `fbclid`. Prefer IPv6 from the client `_fbi` cookie when the
 * client param builder captured it; otherwise fall back to request headers.
 *
 * Fresh ParamBuilder per call — processRequest mutates instance state.
 */
export function resolveCapiBrowserParams(input: {
  host?: string | null;
  cookies: CookieReader;
  query?: Record<string, string> | null;
  referer?: string | null;
  xForwardedFor?: string | null;
  remoteAddress?: string | null;
}): CapiBrowserParams {
  try {
    const builder = new ParamBuilder(PB_DOMAINS);
    const host = (input.host?.split(',')[0]?.trim() || PB_DOMAINS[0] || 'localhost').replace(
      /:\d+$/,
      '',
    );
    const cookiesToSet = builder.processRequest(
      host,
      input.query ?? null,
      cookieMapFrom(input.cookies),
      input.referer ?? null,
      input.xForwardedFor ?? null,
      input.remoteAddress ?? null,
    );
    return {
      fbc: builder.getFbc(),
      fbp: builder.getFbp(),
      clientIp: builder.getClientIpAddress(),
      cookiesToSet,
    };
  } catch {
    return { fbc: null, fbp: null, clientIp: null, cookiesToSet: [] };
  }
}

/** Persist ParamBuilder cookie recommendations (`_fbp` / `_fbc` / `_fbi`). */
export async function applyCapiCookies(cookiesToSet: CookieSettings[]): Promise<void> {
  if (!cookiesToSet.length) return;
  try {
    const store = await cookies();
    for (const c of cookiesToSet) {
      store.set(c.name, c.value, {
        maxAge: c.maxAge,
        ...(c.domain ? { domain: c.domain } : {}),
        path: '/',
        sameSite: 'lax',
        secure: isProd,
        // Must stay readable by the browser pixel + client param builder.
        httpOnly: false,
      });
    }
  } catch {
    // Cookie writes can fail in some RSC/edge contexts — tracking is best-effort.
  }
}

function buildUserData(u: CapiUserData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const em = pii(u.email, 'email');
  const ph = pii(u.phone, 'phone');
  const fn = pii(u.firstName, 'first_name');
  const ln = pii(u.lastName, 'last_name');
  const ct = pii(u.city, 'city');
  const country = pii(u.country, 'country');
  const externalId = pii(u.externalId, 'external_id');
  if (em) data.em = [em];
  if (ph) data.ph = [ph];
  if (fn) data.fn = [fn];
  if (ln) data.ln = [ln];
  if (ct) data.ct = [ct];
  if (country) data.country = [country];
  if (externalId) data.external_id = [externalId];
  // client_ip_address must never be hashed — ParamBuilder may already append
  // the library token (e.g. `1.2.3.4.AQQ…`); send through as-is.
  if (u.clientIp) data.client_ip_address = u.clientIp;
  if (u.userAgent) data.client_user_agent = u.userAgent;
  if (u.fbp) data.fbp = u.fbp;
  if (u.fbc) data.fbc = u.fbc;
  return data;
}

export type CapiEvent = {
  eventName: string;
  /** Shared with the browser event so Meta dedupes the two. */
  eventId: string;
  /** Unix seconds. Defaults to now. */
  eventTime?: number;
  eventSourceUrl?: string;
  userData: CapiUserData;
  customData?: Record<string, unknown>;
};

/**
 * Meta requires `custom_data.value` to be a POSITIVE NUMBER when present. Coerce
 * it to a number and, if it isn't finite and > 0 (e.g. a free item or a fully
 * discounted order), drop `value` and the now-meaningless `currency` so Meta
 * never rejects the event for an invalid value.
 */
function sanitizeCustomData(
  cd: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!cd || !('value' in cd)) return cd;
  const value = Number(cd.value);
  if (Number.isFinite(value) && value > 0) {
    return { ...cd, value, currency: normalizeCurrencyCode(String(cd.currency ?? '')) };
  }
  const out = { ...cd };
  delete out.value;
  delete out.currency;
  return out;
}

/**
 * Send one event to the Conversions API. Best-effort: network/API failures are
 * swallowed so tracking never breaks a checkout. Returns true if sent.
 */
export async function sendCapiEvent(event: CapiEvent): Promise<boolean> {
  if (!capiEnabled()) return false;

  const pixelId = publicEnv.NEXT_PUBLIC_FB_PIXEL_ID;
  const token = serverEnv.META_CAPI_ACCESS_TOKEN as string;
  const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000);
  const customData = sanitizeCustomData(event.customData);

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: event.eventName,
        event_time: eventTime,
        event_id: event.eventId,
        action_source: 'website',
        ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
        user_data: buildUserData(event.userData),
        ...(customData && Object.keys(customData).length ? { custom_data: customData } : {}),
      },
    ],
    ...(serverEnv.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: serverEnv.META_CAPI_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[meta-capi] event rejected', res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[meta-capi] send failed', error instanceof Error ? error.message : error);
    return false;
  }
}
