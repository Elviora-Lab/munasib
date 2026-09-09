'use client';

import { useEffect } from 'react';

import {
  type ClickPayload,
  clickstreamEnabled,
  clickstreamSampleRate,
  deriveClick,
} from '@/lib/analytics/clickstream';
import { useAfterInteractive } from '@/hooks/use-after-interactive';

/**
 * First-party clickstream (not Meta Pixel). Starts only after interaction/idle
 * so bounce landings never open `/api/v1/click`. Pixel loads separately in root
 * layout and is untouched.
 */

const ENDPOINT = '/api/v1/click';
const FLUSH_SIZE = 20;
const FLUSH_MS = 12_000;
const MAX_BATCH = 30;

export function ClickTracker() {
  const ready = useAfterInteractive(4000);

  useEffect(() => {
    if (!clickstreamEnabled || !ready) return;

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
        /* best-effort */
      }
      if (queue.length) flush();
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
  }, [ready]);

  return null;
}
