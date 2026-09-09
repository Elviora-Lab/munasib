'use client';

import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store/hooks';

import { useGetWishlistIdsQuery } from '../wishlist-api';
import { wishlistActions } from '../wishlist-slice';

/**
 * Syncs wishlist hearts for signed-in users only. Guests skip the API entirely
 * (previously every page fired a 401 Function invocation).
 */
export function WishlistHydrator() {
  const dispatch = useAppDispatch();
  const hydrated = useAppSelector((s) => s.auth.hydrated);
  const isAuthenticated = useAppSelector(
    (s) => s.auth.status === 'authenticated' && Boolean(s.auth.user),
  );
  const { data } = useGetWishlistIdsQuery(undefined, {
    skip: !hydrated || !isAuthenticated,
  });

  useEffect(() => {
    if (!data) return;
    dispatch(wishlistActions.hydrate({ productIds: data.productIds }));
  }, [data, dispatch]);

  return null;
}
