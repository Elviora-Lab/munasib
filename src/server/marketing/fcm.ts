import 'server-only';

import { type App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { serverEnv } from '@/config/env';
import { SITE_URL } from '@/config/site';

type PushMessage = {
  token: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  data?: Record<string, string>;
};

export type PushDeliveryResult = {
  delivered: boolean;
  code?: string;
};

type ServiceAccountFields = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * Same credentials you'd pass to:
 *   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
 *
 * Prefer one of:
 * - `FCM_SERVICE_ACCOUNT_JSON` — full service-account JSON as a single secret
 * - or `FCM_PROJECT_ID` + `FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY`
 */
function resolveServiceAccount(): ServiceAccountFields | null {
  const rawJson = serverEnv.FCM_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
      console.warn('[fcm] FCM_SERVICE_ACCOUNT_JSON is missing project_id/client_email/private_key');
    } catch {
      console.warn('[fcm] FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  if (serverEnv.FCM_PROJECT_ID && serverEnv.FCM_CLIENT_EMAIL && serverEnv.FCM_PRIVATE_KEY) {
    return {
      projectId: serverEnv.FCM_PROJECT_ID,
      clientEmail: serverEnv.FCM_CLIENT_EMAIL,
      privateKey: serverEnv.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

export function fcmEnabled(): boolean {
  return resolveServiceAccount() !== null;
}

export function isDeadFcmTokenCode(code: string | undefined): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

function getAdminApp(): App | null {
  const account = resolveServiceAccount();
  if (!account) return null;

  const existing = getApps()[0];
  if (existing) return existing;

  return initializeApp({
    credential: cert({
      projectId: account.projectId,
      clientEmail: account.clientEmail,
      privateKey: account.privateKey,
    }),
    projectId: account.projectId,
  });
}

function absoluteAssetUrl(pathOrUrl: string | undefined, fallbackPath: string): string {
  const site = SITE_URL;
  const value = pathOrUrl?.trim() || fallbackPath;
  if (/^https?:\/\//i.test(value)) return value;
  return `${site}${value.startsWith('/') ? value : `/${value}`}`;
}

export async function sendFcmPush(message: PushMessage): Promise<PushDeliveryResult> {
  const app = getAdminApp();
  if (!app) return { delivered: false, code: 'fcm/not-configured' };

  const link = message.url ?? '/';
  const icon = absoluteAssetUrl(message.icon, '/icon.png');
  // Data-only payloads are reliable on web because the service worker handles
  // background delivery and the client foreground listener mirrors it while open.
  try {
    await getMessaging(app).send({
      token: message.token,
      data: {
        title: message.title,
        body: message.body,
        url: link,
        icon,
        badge: absoluteAssetUrl(undefined, '/icon.png'),
        ...(message.data ?? {}),
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '3600' },
        fcmOptions: { link },
      },
    });
    return { delivered: true };
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    console.warn('[fcm] push failed', code || (error instanceof Error ? error.message : error));
    return { delivered: false, code };
  }
}
