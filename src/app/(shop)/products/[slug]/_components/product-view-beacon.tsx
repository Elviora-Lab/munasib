'use client';

import { useEffect, useRef } from 'react';

const VIEWED_KEY = 'kly_pdp_views';
/** First-party `/view` only — Meta Pixel ViewContent always fires separately. */
const FIRST_PARTY_VIEW_SAMPLE = 0.2;

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
 * Optional first-party product view for admin analytics DB.
 * Sampled at 20% and session-deduped — does NOT replace Meta Pixel / GA
 * `viewItem` (those always fire from ProductExperience).
 */
export function ProductViewBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || alreadyViewed(slug)) return;
    if (Math.random() > FIRST_PARTY_VIEW_SAMPLE) {
      // Remember skip so remounts don't retry and accidentally over-sample.
      markViewed(slug);
      return;
    }
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
