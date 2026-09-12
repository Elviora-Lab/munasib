import { publicEnv } from '@/config/env';

export const runtime = 'nodejs';

function jsString(value: string | undefined): string {
  return JSON.stringify(value ?? '');
}

export function GET() {
  if (
    !publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    !publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    !publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID
  ) {
    return scriptResponse(`
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
});
`);
  }

  const body = `
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY)},
  authDomain: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)},
  projectId: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID)},
  storageBucket: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)},
  messagingSenderId: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)},
  appId: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_APP_ID)},
  measurementId: ${jsString(publicEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID)}
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'Munasib';
  const options = {
    body: notification.body || data.body || 'Your cart and offers are waiting.',
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    data: { url: data.url || '/' }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url === targetUrl) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
`;

  return scriptResponse(body);
}

function scriptResponse(body: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    },
  });
}
