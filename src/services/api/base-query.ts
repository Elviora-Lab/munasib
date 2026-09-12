import {
  type BaseQueryFn,
  type FetchArgs,
  fetchBaseQuery,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query';

import { publicEnv } from '@/config/env';

/**
 * Base URL strategy
 * -----------------
 * Same-origin: backend lives inside this Next.js app at `/api/v1`. We default
 * to a relative path so the call goes to the current origin regardless of
 * environment (preview deploys, custom domains, localhost).
 *
 * The `NEXT_PUBLIC_API_URL` env is only honored when explicitly pointed at a
 * different origin (e.g. for mobile/SSR-from-other-services). The frontend
 * never *requires* a remote backend.
 */
const API_BASE = inferApiBase(publicEnv.NEXT_PUBLIC_API_URL);

function inferApiBase(envValue?: string): string {
  if (!envValue) return '/api/v1';
  try {
    const url = new URL(envValue);
    if (typeof window !== 'undefined' && url.origin === window.location.origin) {
      return url.pathname.replace(/\/+$/, '') || '/api/v1';
    }
    return envValue.replace(/\/+$/, '');
  } catch {
    return envValue.replace(/\/+$/, '');
  }
}

/**
 * RTK Query → envelope unwrapper.
 *
 * Our route handlers return `{ success, message, data, meta?, errors? }`.
 * Endpoints expect just `data`, so we unwrap here once and skip per-query
 * `transformResponse` boilerplate.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  // Auth lives in httpOnly cookies; sending credentials is what authenticates
  // the request. The client never reads or attaches tokens itself.
  credentials: 'include',
  prepareHeaders: (headers) => {
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    headers.set('x-client', 'munasib-web');
    return headers;
  },
});

// Single-flight refresh guard. Tokens are httpOnly cookies, so refreshing just
// means asking the server to rotate the cookie pair; success/failure is the
// HTTP status, and the client holds no token state.
type Mutex = { promise: Promise<boolean> | null };
const refreshMutex: Mutex = { promise: null };

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  // 401 → single-flight refresh → retry once if the cookie was rotated.
  if (result.error?.status === 401) {
    if (!refreshMutex.promise) {
      refreshMutex.promise = refreshAccessToken().finally(() => {
        refreshMutex.promise = null;
      });
    }
    const refreshed = await refreshMutex.promise;

    if (refreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  // 5xx → bounded exponential-backoff retry.
  let attempts = 0;
  while (
    result.error &&
    typeof result.error.status === 'number' &&
    result.error.status >= 500 &&
    attempts < 2
  ) {
    attempts += 1;
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempts));
    result = await rawBaseQuery(args, api, extraOptions);
  }

  // Unwrap our `{ data }` envelope so endpoints receive payload directly.
  if (result.data && typeof result.data === 'object' && 'data' in result.data) {
    const env = result.data as { success?: boolean; data: unknown; meta?: unknown };
    return { ...result, data: env.data, meta: { ...(result.meta ?? {}), envelope: env } };
  }

  return result;
};
