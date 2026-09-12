'use client';

import { getApps, initializeApp } from '@firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from '@firebase/messaging';

import { publicEnv } from '@/config/env';

import { getAnonymousVisitorId, visitorPayload } from './visitor-client';

let foregroundListenerStarted = false;
let grantedSyncPromise: Promise<boolean> | null = null;

export function firebasePushConfigured(): boolean {
  return Boolean(
    publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY &&
    publicEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
    publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID &&
    publicEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  );
}

async function messagingClient() {
  if (!firebasePushConfigured()) return null;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (!(await isSupported())) return null;

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: publicEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: publicEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: publicEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    });

  return getMessaging(app);
}

type PushSubscribeResponse = {
  success?: boolean;
  data?: { subscribed?: boolean };
};

async function postPushSubscription(token: string, permission: NotificationPermission) {
  const response = await fetch('/api/v1/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...visitorPayload(),
      anonymousId: getAnonymousVisitorId(),
      token,
      permission,
      platform: navigator.platform || null,
      pagePath: `${window.location.pathname}${window.location.search}`,
    }),
  }).catch(() => null);

  if (!response || response.status === 204 || !response.ok) return false;

  const json = (await response.json().catch(() => null)) as PushSubscribeResponse | null;
  return Boolean(json?.success && json.data?.subscribed);
}

export async function startForegroundPushListener(): Promise<boolean> {
  if (foregroundListenerStarted) return true;
  if (!firebasePushConfigured()) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  const messaging = await messagingClient();
  if (!messaging) return false;

  const registration = await navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .catch(() => null);
  if (!registration) return false;

  foregroundListenerStarted = true;
  onMessage(messaging, (payload) => {
    const data = payload.data ?? {};
    const title = payload.notification?.title ?? data.title ?? 'Munasib';
    const body = payload.notification?.body ?? data.body ?? undefined;
    const url = data.url ?? payload.fcmOptions?.link ?? '/';
    const icon = payload.notification?.icon ?? data.icon ?? '/icon.png';
    const badge = data.badge ?? '/icon.png';

    registration
      .showNotification(title, {
        body,
        icon,
        badge,
        data: { url },
        tag: data.kind ? `munasib-${data.kind}` : undefined,
      })
      .catch(() => undefined);
  });

  return true;
}

export async function syncGrantedPushSubscription(): Promise<boolean> {
  if (grantedSyncPromise) return grantedSyncPromise;

  grantedSyncPromise = (async () => {
    if (!firebasePushConfigured()) return false;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

    const messaging = await messagingClient();
    if (!messaging) return false;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: publicEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    const subscribed = await postPushSubscription(token, Notification.permission);
    if (!subscribed) return false;

    void startForegroundPushListener();
    return true;
  })().finally(() => {
    grantedSyncPromise = null;
  });

  return grantedSyncPromise;
}

export async function requestPushSubscription(): Promise<
  { ok: true; token: string } | { ok: false; reason: string }
> {
  if (!firebasePushConfigured()) return { ok: false, reason: 'not_configured' };
  if (typeof Notification === 'undefined') return { ok: false, reason: 'not_supported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission };
  }

  const messaging = await messagingClient();
  if (!messaging) return { ok: false, reason: 'not_supported' };

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, {
    vapidKey: publicEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, reason: 'no_token' };

  const subscribed = await postPushSubscription(token, permission);
  if (!subscribed) return { ok: false, reason: 'subscribe_failed' };

  void startForegroundPushListener();
  return { ok: true, token };
}
