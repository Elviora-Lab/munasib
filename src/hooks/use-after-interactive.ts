'use client';

import { useEffect, useState } from 'react';

/**
 * Becomes true after first user interaction, or after `delayMs` of idle —
 * whichever comes first. Use to defer non-critical API hydrators on ad landings.
 */
export function useAfterInteractive(delayMs = 3000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    let timeoutId = 0;
    let idleId = 0;
    let settled = false;

    const go = () => {
      if (settled) return;
      settled = true;
      setReady(true);
      window.clearTimeout(timeoutId);
      if (idleId && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      window.removeEventListener('touchstart', go);
      window.removeEventListener('scroll', go);
    };

    timeoutId = window.setTimeout(go, delayMs);
    window.addEventListener('pointerdown', go, { once: true, passive: true });
    window.addEventListener('keydown', go, { once: true });
    window.addEventListener('touchstart', go, { once: true, passive: true });
    window.addEventListener('scroll', go, { once: true, passive: true });

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(go, { timeout: delayMs });
    }

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      if (idleId && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      window.removeEventListener('touchstart', go);
      window.removeEventListener('scroll', go);
    };
  }, [delayMs, ready]);

  return ready;
}
