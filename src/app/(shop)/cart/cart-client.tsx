'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';

import { useAppSelector } from '@/store/hooks';

import { analytics } from '@/lib/analytics';
import { bestDiscount } from '@/lib/promotions';
import { cheapestShippingFrom, FREE_SHIPPING_THRESHOLD } from '@/lib/shipping';

import { EmptyState } from '@/design-system/primitives/empty-state';
import { Price } from '@/design-system/primitives/price';
import { QuantitySelector } from '@/design-system/primitives/quantity-selector';
import { CartCheckoutNudge } from '@/components/commerce/cart-checkout-nudge';
import { FlashSaleNotice } from '@/components/commerce/flash-sale-notice';
import { TrustBar } from '@/components/commerce/trust-bar';
import { Button } from '@/components/ui/button';

import { useRemoveCartLineMutation, useUpdateCartLineMutation } from '@/features/cart/api/cart-api';
import { useCart } from '@/features/cart/hooks/use-cart';
import {
  type CartLine,
  selectCart,
  selectCartFlashSale,
  selectCartFlashSavings,
} from '@/features/cart/store/cart-slice';
import { RewardsLadder } from '@/features/promotions/components/rewards-ladder';
import { useSpendDiscount } from '@/features/promotions/hooks/use-spend-discount';
import { CartRecommendations } from '@/features/recommendations/components/cart-recommendations';

import { CouponField } from './coupon-field';

export function CartPageClient() {
  const { cart, subtotal, count, updateQty, remove } = useCart();
  const { couponCode, couponDiscount } = useAppSelector(selectCart);
  const flashSale = useAppSelector(selectCartFlashSale);
  const flashSavings = useAppSelector(selectCartFlashSavings);
  const { spendDiscount } = useSpendDiscount(subtotal);
  // Best-single-wins (matches the server): the larger of coupon vs spend tier.
  const { amount: discount, source } = bestDiscount(couponDiscount ?? 0, spendDiscount);
  const discountLabel =
    source === 'spend' ? 'Spend & Save' : couponCode ? `Coupon ${couponCode}` : 'Discount';
  const currency = cart.lines[0]?.currency ?? 'PKR';
  const total = Math.max(0, subtotal - discount);
  const [updateLine] = useUpdateCartLineMutation();
  const [removeLineMutation] = useRemoveCartLineMutation();

  // GA4 view_cart — once per mount, when the bag has items.
  const trackedView = useRef(false);
  useEffect(() => {
    if (trackedView.current || cart.lines.length === 0) return;
    trackedView.current = true;
    analytics.viewCart({
      value: subtotal,
      currency: cart.lines[0]?.currency ?? 'PKR',
      items: cart.lines.map((l, i) => ({
        item_id: l.productId,
        item_name: l.name,
        item_variant: l.variantId,
        price: l.unitPrice,
        quantity: l.quantity,
        index: i,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUpdateQty(line: { id?: string; productId: string; variantId: string }, q: number) {
    updateQty(line.productId, line.variantId, q);
    if (line.id)
      updateLine({ lineId: line.id, quantity: q })
        .unwrap()
        .catch(() => undefined);
  }

  function handleRemove(line: CartLine) {
    analytics.removeFromCart({
      value: line.unitPrice * line.quantity,
      currency: line.currency,
      items: [
        {
          item_id: line.productId,
          item_name: line.name,
          item_variant: line.variantId,
          price: line.unitPrice,
          quantity: line.quantity,
        },
      ],
    });
    remove(line.productId, line.variantId);
    if (line.id)
      removeLineMutation({ lineId: line.id })
        .unwrap()
        .catch(() => undefined);
  }

  if (count === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        description="When you find something you love, it will appear here."
        action={
          <Button asChild>
            <Link href="/products">Browse the edit</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-16 pb-24 lg:pb-0">
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <ul className="flex flex-col divide-y divide-border">
          {cart.lines.map((line) => (
            <li key={`${line.productId}-${line.variantId}`} className="flex gap-6 py-6">
              <div className="relative size-28 shrink-0 overflow-hidden rounded-md bg-gradient-cloud">
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.name}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center font-serif text-[10px] uppercase tracking-[0.2em] text-brand-slate/30"
                  >
                    Munasib
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Link
                  href={`/products/${line.slug}`}
                  className="font-serif text-lg font-light underline-offset-4 hover:underline"
                >
                  {line.name}
                </Link>
                <Price
                  amount={line.unitPrice}
                  compareAt={line.originalPrice}
                  currency={line.currency}
                />
                <div className="mt-auto flex items-center justify-between">
                  <QuantitySelector
                    value={line.quantity}
                    onChange={(q) => handleUpdateQty(line, q)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(line)}
                    className="text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-serif text-2xl font-light">Order summary</h2>
          <CartCheckoutNudge subtotal={subtotal} currency={currency} />
          {flashSale ? (
            <FlashSaleNotice
              title={flashSale.title}
              endsAt={flashSale.endsAt}
              savings={flashSavings}
              currency={currency}
            />
          ) : null}
          <RewardsLadder subtotal={subtotal} currency={currency} />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <Price amount={subtotal} currency={currency} />
          </div>
          <CouponField />
          {discount > 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{discountLabel}</span>
              <span className="tabular-nums text-success">
                −<Price amount={discount} currency={currency} />
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span className="tabular-nums">
              {subtotal >= FREE_SHIPPING_THRESHOLD ? (
                <span className="font-medium text-success">Free</span>
              ) : (
                // Within-Karachi starting rate (see /shipping copy).
                <span className="text-muted-foreground">
                  from <Price amount={cheapestShippingFrom(count)} currency={currency} size="sm" />
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-medium">
            <span>Total</span>
            <Price amount={total} currency={currency} />
          </div>
          <p className="text-xs text-muted-foreground">
            Delivery is set by your city (free over{' '}
            <Price amount={FREE_SHIPPING_THRESHOLD} currency={currency} />) — exact shipping is
            shown at checkout before you place the order.
          </p>
          <Button asChild size="lg" variant="cta" uppercase>
            <Link href="/checkout">
              <Lock className="size-4" aria-hidden />
              Secure checkout
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No card needed. Place the order now and pay cash on delivery.
          </p>
          <TrustBar />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 shadow-elevated backdrop-blur lg:hidden">
        <div className="container flex items-center gap-3 px-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cart total</p>
            <Price amount={total} currency={currency} size="sm" />
          </div>
          <Button asChild size="lg" variant="cta" uppercase className="shrink-0">
            <Link href="/checkout">
              <Lock className="size-4" aria-hidden />
              COD checkout
            </Link>
          </Button>
        </div>
      </div>

      <CartRecommendations />
    </div>
  );
}
