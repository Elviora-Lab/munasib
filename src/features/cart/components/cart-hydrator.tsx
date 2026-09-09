'use client';

import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store/hooks';

import { useAfterInteractive } from '@/hooks/use-after-interactive';

import { useGetCartQuery } from '../api/cart-api';
import { type CartLine, hydrate } from '../store/cart-slice';

/**
 * Server cart → Redux. Deferred until interaction / idle / cart open so ad
 * landings don't pay a Node Function to mint an empty guest cart.
 */
export function CartHydrator() {
  const dispatch = useAppDispatch();
  const cartOpen = useAppSelector((s) => s.ui.cartOpen);
  const idleReady = useAfterInteractive(3000);
  const ready = idleReady || cartOpen;
  const { data } = useGetCartQuery(undefined, { skip: !ready });

  useEffect(() => {
    if (!data) return;
    dispatch(
      hydrate({
        lines: data.lines.map(toSliceLine),
        couponCode: data.couponCode ?? null,
        couponDiscount: null,
        shippingMethodId: null,
        flashSale: data.flashSale ?? null,
      }),
    );
  }, [data, dispatch]);

  return null;
}

function toSliceLine(line: {
  id?: string;
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  imageUrl: string;
  unitPrice: number;
  originalPrice?: number;
  quantity: number;
  currency: string;
}): CartLine {
  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId ?? '',
    slug: line.slug,
    name: line.name,
    imageUrl: line.imageUrl,
    unitPrice: line.unitPrice,
    originalPrice: line.originalPrice,
    quantity: line.quantity,
    currency: line.currency,
  };
}
