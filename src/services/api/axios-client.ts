import axios, { type AxiosInstance } from 'axios';

import { publicEnv } from '@/config/env';

/**
 * Axios instance for non-RTK-Query call sites (server actions, one-off
 * fetches, integrations). For data in components, prefer RTK Query hooks.
 *
 * Auth is carried by httpOnly cookies — `withCredentials` sends them; the
 * client never reads or attaches tokens itself.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: publicEnv.NEXT_PUBLIC_API_URL,
  timeout: 20_000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-client': 'munasib-web',
  },
});
