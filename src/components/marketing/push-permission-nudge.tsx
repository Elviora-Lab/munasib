'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, BellRing } from 'lucide-react';
import { toast } from 'sonner';

import { analytics } from '@/lib/analytics';
import {
  firebasePushConfigured,
  requestPushSubscription,
  startForegroundPushListener,
  syncGrantedPushSubscription,
} from '@/lib/marketing/push-client';
import {
  syncMarketingVisitor,
  trackHighIntent,
  trackVisitorEvent,
} from '@/lib/marketing/visitor-client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useCart } from '@/features/cart/hooks/use-cart';

const DISMISSED_UNTIL_KEY = 'kly_push_dismissed_until';
const PRODUCT_VIEWS_KEY = 'kly_session_product_views';
const CART_INTENT_KEY = 'kly_cart_intent_tracked';
const HIGH_INTENT_KEY = 'kly_high_intent_tracked';
const SILENT_PUSH_SYNC_KEY = 'kly_push_synced_at';
const DAY_MS = 24 * 60 * 60 * 1000;
const SILENT_PUSH_SYNC_MS = 6 * 60 * 60 * 1000;

function dismissedUntil(): number {
  try {
    return Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function dismissFor(days: number) {
  try {
    window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + days * DAY_MS));
  } catch {
    /* storage unavailable */
  }
}

function recentlySyncedGrantedPush(): boolean {
  try {
    const syncedAt = Number(window.localStorage.getItem(SILENT_PUSH_SYNC_KEY) ?? 0);
    return Date.now() - syncedAt < SILENT_PUSH_SYNC_MS;
  } catch {
    return false;
  }
}

function markGrantedPushSynced() {
  try {
    window.localStorage.setItem(SILENT_PUSH_SYNC_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

function incrementProductViews(pathname: string): number {
  if (!pathname.startsWith('/products/')) return 0;
  try {
    const raw = window.sessionStorage.getItem(PRODUCT_VIEWS_KEY);
    const seen = new Set(raw ? JSON.parse(raw) : []);
    seen.add(pathname);
    window.sessionStorage.setItem(PRODUCT_VIEWS_KEY, JSON.stringify([...seen].slice(-8)));
    return seen.size;
  } catch {
    return 1;
  }
}

export function PushPermissionNudge() {
  const pathname = usePathname();
  const { count, subtotal } = useCart();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState<'cart' | 'browse'>('cart');
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentSyncAttempted = useRef(false);

  const eligiblePath = useMemo(
    () =>
      !pathname.startsWith('/admin') &&
      !pathname.startsWith('/checkout') &&
      !pathname.startsWith('/login') &&
      !pathname.startsWith('/review'),
    [pathname],
  );

  // Visitor upsert once per tab session, deferred so bounce PDPs skip it.
  useEffect(() => {
    if (!eligiblePath) return;
    const timer = setTimeout(() => {
      void syncMarketingVisitor();
    }, 5000);
    return () => clearTimeout(timer);
  }, [eligiblePath]);

  useEffect(() => {
    if (!eligiblePath || !firebasePushConfigured()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    void startForegroundPushListener();
    if (silentSyncAttempted.current || recentlySyncedGrantedPush()) return;

    silentSyncAttempted.current = true;
    void syncGrantedPushSubscription().then((synced) => {
      if (synced) {
        markGrantedPushSynced();
        return;
      }
      silentSyncAttempted.current = false;
    });
  }, [eligiblePath]);

  useEffect(() => {
    if (!eligiblePath) return;
    const views = incrementProductViews(pathname);
    if (views >= 2) {
      try {
        if (window.sessionStorage.getItem(HIGH_INTENT_KEY) !== '1') {
          window.sessionStorage.setItem(HIGH_INTENT_KEY, '1');
          trackHighIntent('multiple_product_views', 8);
        }
      } catch {
        trackHighIntent('multiple_product_views', 8);
      }
    }
  }, [eligiblePath, pathname]);

  useEffect(() => {
    if (!eligiblePath || count <= 0) return;
    try {
      if (window.sessionStorage.getItem(CART_INTENT_KEY) === '1') return;
      window.sessionStorage.setItem(CART_INTENT_KEY, '1');
    } catch {
      /* continue */
    }
    // One first-party marketing POST (CartHasItems) + Pixel/CAPI high-intent.
    // Do not also call trackHighIntent() — that POSTs HighIntentVisitor and
    // would double-apply scoreDelta 12 for the same cart moment.
    trackVisitorEvent({
      eventName: 'CartHasItems',
      value: subtotal,
      currency: 'PKR',
      scoreDelta: 12,
      metadata: { itemCount: count, highIntentReason: 'cart_has_items' },
    });
    analytics.highIntentVisitor({ reason: 'cart_has_items', score: 12 });
  }, [count, eligiblePath, subtotal]);

  useEffect(() => {
    if (!eligiblePath || !firebasePushConfigured()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    if (Date.now() < dismissedUntil()) return;

    const views = (() => {
      try {
        const raw = window.sessionStorage.getItem(PRODUCT_VIEWS_KEY);
        return raw ? (JSON.parse(raw) as unknown[]).length : 0;
      } catch {
        return 0;
      }
    })();
    const shouldPrompt = count > 0 || views >= 2;
    if (!shouldPrompt) return;

    setReason(count > 0 ? 'cart' : 'browse');
    promptTimer.current = setTimeout(() => setOpen(true), count > 0 ? 1400 : 3000);
    return () => {
      if (promptTimer.current) clearTimeout(promptTimer.current);
    };
  }, [count, eligiblePath, pathname]);

  async function enablePush() {
    setPending(true);
    const result = await requestPushSubscription();
    setPending(false);

    if (result.ok) {
      dismissFor(365);
      setOpen(false);
      toast.success('Reminders enabled');
      return;
    }

    if (result.reason === 'denied') {
      dismissFor(365);
      toast.error('Notifications are blocked in this browser');
    } else if (result.reason === 'not_configured') {
      dismissFor(7);
      toast.error('Push reminders are not configured yet');
    } else if (result.reason === 'subscribe_failed') {
      dismissFor(1);
      toast.error('Could not save push reminders. Please try again.');
    } else {
      dismissFor(14);
      toast.error('Push reminders are not available on this browser');
    }
    setOpen(false);
  }

  function close() {
    dismissFor(7);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {reason === 'cart' ? (
              <BellRing className="size-5 text-accent" />
            ) : (
              <Bell className="size-5 text-accent" />
            )}
            {reason === 'cart' ? 'Get a cart reminder?' : 'Get useful deal reminders?'}
          </DialogTitle>
          <DialogDescription>
            {reason === 'cart'
              ? 'We can remind you about your saved cart, price drops, and restocks. No email needed.'
              : 'Allow browser reminders for price drops, back-in-stock items, and products you viewed.'}
          </DialogDescription>
        </DialogHeader>

        <Button size="lg" variant="cta" uppercase loading={pending} onClick={enablePush}>
          Allow reminders
        </Button>
        <button
          type="button"
          onClick={close}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Not now
        </button>
      </DialogContent>
    </Dialog>
  );
}
