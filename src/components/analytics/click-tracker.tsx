'use client';

import { useEffect } from 'react';

import {
  type ClickPayload,
  clickstreamEnabled,
  clickstreamSampleRate,
  deriveClick,
} from '@/lib/analytics/clickstream';

/**
 * First-party clickstream capture.
 *
 * One delegated, capture-phase listener records every meaningful link/button
 * click (see `deriveClick`), batches them, and flushes via `navigator.sendBeacon`
 * on a timer, when the batch fills, and on page hide — so in-flight clicks
 * survive a navigation. Identity is derived server-side at `/api/v1/click`; the
 * browser only sends the anonymous payload. Rendered once in the root layout;
 * inert unless enabled (production, or the dev opt-in flag).
 */

const ENDPOINT = '/api/v1/click';
const FLUSH_SIZE = 20; // fewer beacons — batch more clicks per request
const FLUSH_MS = 12_000;
const MAX_BATCH = 30; // matches the endpoint's per-request cap

export function ClickTracker() {
  useEffect(() => {
    if (!clickstreamEnabled) return;

    let queue: ClickPayload[] = [];

    const flush = () => {
      if (!queue.length) return;
      const batch = queue.slice(0, MAX_BATCH);
      queue = queue.slice(MAX_BATCH);
      const body = JSON.stringify({ events: batch });
      try {
        const blob = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon?.(ENDPOINT, blob);
        if (!sent) {
          void fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          });
        }
      } catch {
        /* best-effort — a tracking hiccup must never affect the shopper */
      }
      if (queue.length) flush(); // drain remainder if we overflowed one batch
    };

    const onClick = (e: MouseEvent) => {
      if (clickstreamSampleRate < 1 && Math.random() > clickstreamSampleRate) return;
      const payload = deriveClick(e.target);
      if (!payload) return;
      queue.push(payload);
      if (queue.length >= FLUSH_SIZE) flush();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    const timer = setInterval(flush, FLUSH_MS);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      clearInterval(timer);
      flush();
    };
  }, []);

  return null;
}
