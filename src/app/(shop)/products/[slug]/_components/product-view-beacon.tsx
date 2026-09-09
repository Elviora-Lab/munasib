'use client';

import { useEffect, useRef } from 'react';

const VIEWED_KEY = 'kly_pdp_views';

function alreadyViewed(slug: string): boolean {
  try {
    const raw = sessionStorage.getItem(VIEWED_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    return seen.includes(slug);
  } catch {
    return false;
  }
}

function markViewed(slug: string) {
  try {
    const raw = sessionStorage.getItem(VIEWED_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(slug)) {
      seen.push(slug);
      sessionStorage.setItem(VIEWED_KEY, JSON.stringify(seen.slice(-40)));
    }
  } catch {
    /* private mode */
  }
}

/**
 * One-shot first-party product view. Deduped per slug per tab session so
 * back/forward and remounts don't add Edge Requests. Lives on the client so
 * the PDP stays ISR-cacheable.
 */
export function ProductViewBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || alreadyViewed(slug)) return;
    sent.current = true;
    markViewed(slug);
    fetch(`/api/v1/products/${encodeURIComponent(slug)}/view`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    }).catch(() => undefined);
  }, [slug]);
  return null;
}
