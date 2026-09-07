'use client';

import { useEffect } from 'react';

import { pixelEnabled } from '@/lib/analytics/meta-pixel';

/**
 * Meta CAPI Parameter Builder — client side.
 *
 * On first mount it captures `_fbp` / `_fbc` as early as possible, generates
 * `_fbc` from `?fbclid` when missing, and (via `getIpFn`) stores the shopper's
 * public IP in `_fbi`. Server CAPI calls then run Meta's Node ParamBuilder over
 * those cookies + request headers for best-available `client_ip_address`.
 *
 * The package is a browser UMD bundle (references `self`), so it is loaded via a
 * dynamic import INSIDE the effect — effects never run during SSR. Production
 * only (mirrors the pixel).
 */
export function CapiParamInit() {
  useEffect(() => {
    if (!pixelEnabled) return;
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
  }, []);

  return null;
}

/** Prefer IPv6 from our first-party endpoint; empty string if unavailable. */
async function fetchClientIp(): Promise<string> {
  try {
    const res = await fetch('/api/v1/meta/client-ip', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const json = (await res.json()) as { data?: { ip?: string } };
    const ip = json.data?.ip?.trim();
    return ip || '';
  } catch {
    return '';
  }
}
