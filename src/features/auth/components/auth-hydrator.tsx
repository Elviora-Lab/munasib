'use client';

import { useEffect } from 'react';

import { useAppDispatch } from '@/store/hooks';

import { useAfterInteractive } from '@/hooks/use-after-interactive';

import { useMeQuery } from '../api/auth-api';
import { clearUser, setHydrated, setUser } from '../store/auth-slice';

/**
 * Session cookie → Redux. Storefront assumes guest immediately (hydrated), then
 * confirms `/auth/me` after idle/interaction so bounce traffic skips the call.
 */
export function AuthHydrator() {
  const dispatch = useAppDispatch();
  const ready = useAfterInteractive(2500);
  const { data, isSuccess, isError } = useMeQuery(undefined, { skip: !ready });

  useEffect(() => {
    dispatch(setHydrated(true));
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    if (isSuccess && data) {
      dispatch(setUser(data));
    } else if (isError) {
      dispatch(clearUser());
    }
  }, [ready, data, isSuccess, isError, dispatch]);

  return null;
}
