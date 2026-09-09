'use client';

import { useEffect } from 'react';

import { pixelEnabled } from '@/lib/analytics/meta-pixel';
import { useAfterInteractive } from '@/hooks/use-after-interactive';

const IP_SESSION_KEY = 'kly_meta_client_ip';

/**
 * Meta CAPI Parameter Builder — client side.
 *
 * Deferred until idle/interaction so bounce landings skip `/api/v1/meta/client-ip`.
 * IP is cached in sessionStorage for the tab so SPA navigations don't re-hit
 * the Edge.
 */
export function CapiParamInit() {
  const ready = useAfterInteractive(4000);

  useEffect(() => {
    if (!pixelEnabled || !ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import('meta-capi-param-builder-clientjs');
        if (cancelled) return;
        if (typeof mod.processAndCollectAllParams === 'function') {
          await mod.processAndCollectAllParams(window.location.href, fetchClientIp);
        }
      } catch {
        /* best-effort — tracking must never break the page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return null;
}

/** Prefer IPv6 from our first-party endpoint; empty string if unavailable. */
async function fetchClientIp(): Promise<string> {
  try {
    const cached = window.sessionStorage.getItem(IP_SESSION_KEY);
    if (cached !== null) return cached;

    const res = await fetch('/api/v1/meta/client-ip', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'force-cache',
    });
    if (!res.ok) return '';
    const json = (await res.json()) as { data?: { ip?: string } };
    const ip = json.data?.ip?.trim() || '';
    window.sessionStorage.setItem(IP_SESSION_KEY, ip);
    return ip;
  } catch {
    return '';
  }
}
