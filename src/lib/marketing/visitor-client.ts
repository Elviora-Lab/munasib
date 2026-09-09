'use client';

import { analytics } from '@/lib/analytics';

const VISITOR_KEY = 'kly_visitor_id';
const FIRST_PATH_KEY = 'kly_first_path';
/** One upsert per browser tab session — cuts Vercel invocations on SPA navigations. */
const VISITOR_SESSION_SYNC_KEY = 'kly_visitor_session_synced';

type VisitorUtm = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
};

type VisitorPayload = {
  anonymousId: string;
  fbp?: string | null;
  fbc?: string | null;
  utm?: VisitorUtm;
  firstPath?: string | null;
  lastPath?: string | null;
  referrer?: string | null;
  deviceType?: string | null;
  notificationPermission?: NotificationPermission | null;
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function readUtm(): VisitorUtm {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
  };
  if (Object.values(fromUrl).some(Boolean)) return fromUrl;

  const cookie = readCookie('elv_utm');
  if (!cookie) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(cookie)) as { s?: string; m?: string; c?: string };
    return { source: parsed.s, medium: parsed.m, campaign: parsed.c };
  } catch {
    return {};
  }
}

export function getAnonymousVisitorId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const fresh = randomId();
    window.localStorage.setItem(VISITOR_KEY, fresh);
    document.cookie = `kly_vid=${encodeURIComponent(fresh)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    return fresh;
  } catch {
    return readCookie('kly_vid') ?? randomId();
  }
}

function firstPath(): string {
  try {
    const existing = window.localStorage.getItem(FIRST_PATH_KEY);
    if (existing) return existing;
    const current = `${window.location.pathname}${window.location.search}`;
    window.localStorage.setItem(FIRST_PATH_KEY, current);
    return current;
  } catch {
    return window.location.pathname;
  }
}

export function visitorPayload(): VisitorPayload {
  const anonymousId = getAnonymousVisitorId();
  const notificationPermission =
    typeof Notification === 'undefined' ? null : Notification.permission;

  return {
    anonymousId,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    utm: readUtm(),
    firstPath: firstPath(),
    lastPath: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || null,
    deviceType: window.matchMedia?.('(pointer: coarse)').matches ? 'mobile_touch' : 'desktop',
    notificationPermission,
  };
}

/**
 * Upsert the anonymous marketing visitor. Only when the visit has an
 * acquisition signal (UTM / fbclid / gclid or persisted `elv_utm` cookie) so
 * organic bounces don't pay an Edge Request. Still once per tab session.
 */
export async function syncMarketingVisitor(options?: { force?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (!options?.force && window.sessionStorage.getItem(VISITOR_SESSION_SYNC_KEY) === '1') {
      return;
    }
    if (!options?.force && !hasAcquisitionSignal()) {
      return;
    }
    await fetch('/api/v1/marketing/visitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visitorPayload()),
      keepalive: true,
    });
    window.sessionStorage.setItem(VISITOR_SESSION_SYNC_KEY, '1');
  } catch {
    /* best-effort — do not mark synced so a later attempt can retry */
  }
}

/** True when this hit (or prior landing cookie) carries paid/campaign params. */
function hasAcquisitionSignal(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (
    params.get('utm_source') ||
    params.get('utm_medium') ||
    params.get('utm_campaign') ||
    params.get('utm_content') ||
    params.get('utm_term') ||
    params.get('fbclid') ||
    params.get('gclid')
  ) {
    return true;
  }
  return Boolean(readCookie('elv_utm'));
}

export function trackVisitorEvent(input: {
  eventName: string;
  productId?: string | null;
  variantId?: string | null;
  cartId?: string | null;
  value?: number | null;
  currency?: string | null;
  scoreDelta?: number;
  metadata?: Record<string, unknown>;
}) {
  if (typeof window === 'undefined') return;
  const body = {
    anonymousId: getAnonymousVisitorId(),
    pagePath: `${window.location.pathname}${window.location.search}`,
    ...input,
  };
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/v1/marketing/events', blob)) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch('/api/v1/marketing/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

export function trackHighIntent(reason: string, score: number) {
  trackVisitorEvent({ eventName: 'HighIntentVisitor', scoreDelta: score, metadata: { reason } });
  analytics.highIntentVisitor({ reason, score });
}
