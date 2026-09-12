'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Flame, Truck, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { useAppDispatch } from '@/store/hooks';
import { openCart } from '@/store/slices/ui-slice';

import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { trackVisitorEvent } from '@/lib/marketing/visitor-client';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping';

import { Price } from '@/design-system/primitives/price';
import { QuantitySelector } from '@/design-system/primitives/quantity-selector';
import { Rating } from '@/design-system/primitives/rating';
import { FlashCountdown } from '@/components/commerce/flash-countdown';
import { TrustBar } from '@/components/commerce/trust-bar';
import { ProductPushAlertButton } from '@/components/marketing/product-push-alert-button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RichText } from '@/components/ui/rich-text';

import { cartApi } from '@/features/cart/api/cart-api';
import { useCartActions } from '@/features/cart/hooks/use-cart';

import { BackInStockNotify } from './back-in-stock-notify';

import { addToCart } from '@/server/actions/cart.actions';

export type GalleryImage = { url: string; alt: string; variantId: string | null };
export type VariantOption = {
  id: string;
  name: string;
  hex?: string;
  /** Sale price while a flash sale runs, list price otherwise. */
  price: number;
  /** Pre-discount price — set only during a flash sale. */
  originalPrice?: number;
  stockQuantity: number;
  isActive: boolean;
};
export type PdpFlashSale = { title: string; endsAt: string; discountPercent: number };
export type IngredientItem = { id: string; name: string; description?: string | null };

type Props = {
  productId: string;
  productSlug: string;
  productName: string;
  brandName?: string;
  brandSlug?: string;
  shortDescription?: string;
  fullDescription?: string;
  skinConcerns: { id: string; name: string }[];
  ingredients: IngredientItem[];
  images: GalleryImage[];
  variants: VariantOption[];
  comparePrice?: number;
  flashSale?: PdpFlashSale | null;
  currency?: string;
  fallbackPrice: number;
  outOfStock: boolean;
  rating?: number;
  reviewCount?: number;
};

export function ProductExperience({
  productId,
  productSlug,
  productName,
  brandName,
  brandSlug,
  shortDescription,
  fullDescription,
  skinConcerns,
  ingredients,
  images,
  variants,
  comparePrice,
  flashSale,
  currency = 'PKR',
  fallbackPrice,
  outOfStock,
  rating,
  reviewCount,
}: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // Brief "Added" confirmation on the CTA after a successful add — visible
  // feedback right where the tap happened (the drawer opening can be missed).
  const [justAdded, setJustAdded] = useState(false);
  // Write-only cart API — this component never reads cart state, so it must
  // not re-render on every cart mutation (it's the heaviest client tree on
  // the PDP).
  const cart = useCartActions();
  const [pending, start] = useTransition();

  const firstAvailable = useMemo(
    () => variants.find((v) => v.isActive && v.stockQuantity > 0) ?? variants[0],
    [variants],
  );
  const [variantId, setVariantId] = useState<string | undefined>(firstAvailable?.id);
  const [quantity, setQuantity] = useState(1);
  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = images.findIndex((im) => im.variantId === firstAvailable?.id);
    return idx >= 0 ? idx : 0;
  });

  // Once the countdown expires the sale price is no longer what checkout will
  // charge, so drop back to list pricing immediately rather than showing a
  // stale figure until the ISR page revalidates (up to 300s later).
  const [saleExpired, setSaleExpired] = useState(false);
  const onSale = Boolean(flashSale) && !saleExpired;
  const handleSaleExpire = useCallback(() => setSaleExpired(true), []);

  const selected = variants.find((v) => v.id === variantId);
  // `price` already carries the discount when a sale was live at render time.
  // Only an expiry mid-visit sends us back to `originalPrice`; with no sale at
  // all `originalPrice` is undefined and `price` is simply the list price.
  const currentPrice =
    (saleExpired ? (selected?.originalPrice ?? selected?.price) : selected?.price) ?? fallbackPrice;
  // During a sale the strike-through is this variant's own pre-sale price;
  // otherwise fall back to the product-level comparePrice.
  const currentCompareAt = onSale ? selected?.originalPrice : comparePrice;
  const maxForVariant = selected?.stockQuantity ?? 0;
  const canAdd = !!selected && selected.isActive && selected.stockQuantity > 0;
  const selectedLineTotal = currentPrice * quantity;
  const remainingForFreeDelivery = Math.max(0, FREE_SHIPPING_THRESHOLD - selectedLineTotal);

  const total = images.length;
  const active = images[activeIndex];
  const go = (dir: 1 | -1) => setActiveIndex((i) => (i + dir + total) % total);

  // Sticky "Add to bag" bar — show whenever the main CTA is off-screen, so the
  // buy action is always one tap away (less friction → more add-to-carts).
  const ctaRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([entry]) => setShowSticky(!entry?.isIntersecting), {
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Analytics: fire a product view once per product (Meta ViewContent + GA4 view_item).
  useEffect(() => {
    analytics.viewItem({ id: productId, name: productName, price: currentPrice, currency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function selectVariant(id: string) {
    setVariantId(id);
    const idx = images.findIndex((im) => im.variantId === id);
    if (idx >= 0) setActiveIndex(idx);
  }

  function handleAdd() {
    if (!selected || !canAdd) return;
    cart.add({
      productId,
      variantId: selected.id,
      slug: productSlug,
      name: variants.length > 1 ? `${productName} - ${selected.name}` : productName,
      imageUrl: active?.url ?? '',
      // `currentPrice`, not `selected.price` — the optimistic line must match
      // what the server will store, including a sale that expired mid-visit.
      unitPrice: currentPrice,
      currency,
      quantity,
    });
    analytics.addToCart({
      id: productId,
      name: selected.name,
      quantity,
      price: currentPrice,
      currency,
    });
    trackVisitorEvent({
      eventName: 'AddToCartIntent',
      productId,
      variantId: selected.id,
      value: currentPrice * quantity,
      currency,
      scoreDelta: 25,
      metadata: { quantity },
    });
    start(async () => {
      const result = await addToCart({ variantId: selected.id, quantity });
      if (result.success) {
        toast.success('Added to cart');
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1600);
        dispatch(openCart());
        dispatch(cartApi.util.invalidateTags(['Cart']));
        router.refresh();
      } else {
        toast.error(result.message);
        cart.remove(productId, selected.id);
      }
    });
  }

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery column: main image + thumbnail strip share one grid cell,
            so the buy column always sits beside them on lg+. */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-white">
            {active?.url ? (
              // All gallery images stay mounted; the active one is revealed via
              // opacity. Keying a single Image by URL remounted (re-decoded) it
              // on every arrow/variant switch.
              images.map((im, idx) => (
                <Image
                  key={`${im.url}-${idx}`}
                  src={im.url}
                  alt={im.alt}
                  fill
                  priority={idx === 0}
                  sizes="(min-width:1024px) 50vw, 100vw"
                  className={cn(
                    'object-contain transition-opacity duration-300',
                    idx === activeIndex ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden={idx !== activeIndex}
                />
              ))
            ) : (
              <span
                aria-hidden
                className="absolute inset-0 grid place-items-center font-serif text-3xl font-light uppercase tracking-[0.22em] text-brand-slate/30"
              >
                Munasib
              </span>
            )}

            {total > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous image"
                  className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur transition hover:bg-background"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next image"
                  className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow-soft backdrop-blur transition hover:bg-background"
                >
                  <ChevronRight className="size-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-1 text-xs tabular-nums text-foreground backdrop-blur">
                  {activeIndex + 1} / {total}
                </div>
              </>
            ) : null}
          </div>

          {/* Thumbnail strip — tap to jump; the active thumb carries a teal
              ring. Capped so shade-heavy legacy products don't spawn dozens of
              image requests; arrows still reach every image. */}
          {total > 1 ? (
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 12).map((im, idx) => (
                <button
                  key={`${im.url}-thumb-${idx}`}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`Show image ${idx + 1}`}
                  aria-current={idx === activeIndex}
                  className={cn(
                    'relative size-16 shrink-0 overflow-hidden rounded-lg border bg-white transition-all duration-200',
                    idx === activeIndex
                      ? 'border-accent ring-2 ring-accent/40'
                      : 'border-border opacity-70 hover:opacity-100',
                  )}
                >
                  <Image src={im.url} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
              {total > 12 ? (
                <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-border text-xs font-medium text-muted-foreground">
                  +{total - 12}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {brandName ? (
                brandSlug ? (
                  <Link
                    href={`/brands/${brandSlug}`}
                    className="eyebrow w-fit transition-colors hover:text-foreground"
                  >
                    {brandName}
                  </Link>
                ) : (
                  <span className="eyebrow">{brandName}</span>
                )
              ) : null}
              <h1 className="editorial-heading text-display-md md:text-display-lg">
                {productName}
              </h1>
              {reviewCount && reviewCount > 0 ? (
                <a href="#reviews" className="w-fit transition-opacity hover:opacity-80">
                  <Rating value={rating ?? 0} reviewCount={reviewCount} />
                </a>
              ) : null}
              {shortDescription ? (
                <p className="text-pretty leading-relaxed text-muted-foreground">
                  {shortDescription}
                </p>
              ) : null}
            </div>
            {skinConcerns.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skinConcerns.map((c) => (
                  <Badge key={c.id} variant="outline">
                    {c.name}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
            {onSale && flashSale ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-brand-ember/25 bg-brand-ember/[0.06] px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ember">
                  <Zap className="size-3.5" aria-hidden />
                  {flashSale.title} · {flashSale.discountPercent}% off
                </span>
                <span className="inline-flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Ends in</span>
                  <FlashCountdown endsAt={flashSale.endsAt} onExpire={handleSaleExpire} />
                </span>
              </div>
            ) : null}

            <Price
              amount={currentPrice}
              compareAt={currentCompareAt}
              currency={currency}
              size="lg"
              showSavings
            />

            {variants.length > 1 ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <Label>Choose an option</Label>
                  {selected ? (
                    <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      {selected.name}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const disabled = !v.isActive || v.stockQuantity === 0;
                    const isActive = variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => !disabled && selectVariant(v.id)}
                        disabled={disabled}
                        title={disabled ? `${v.name} (out of stock)` : v.name}
                        aria-label={v.name}
                        aria-pressed={isActive}
                        className={cn(
                          'relative overflow-hidden border transition-all duration-200 active:scale-95',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          v.hex
                            ? 'grid size-8 place-items-center rounded-full'
                            : 'rounded-lg px-3.5 py-2 text-xs font-medium',
                          isActive
                            ? v.hex
                              ? 'border-transparent ring-2 ring-foreground ring-offset-2 ring-offset-card'
                              : 'border-primary bg-primary text-primary-foreground shadow-soft'
                            : v.hex
                              ? 'border-border/60 hover:scale-110'
                              : 'border-border bg-background text-foreground hover:border-accent/60 hover:text-accent',
                          disabled && 'cursor-not-allowed opacity-40',
                        )}
                        style={v.hex ? { backgroundColor: v.hex } : undefined}
                      >
                        {!v.hex ? v.name : null}
                        {disabled ? (
                          <span
                            aria-hidden
                            className="absolute inset-0 grid place-items-center text-base text-foreground/70"
                          >
                            ⁄
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label>Quantity</Label>
              <QuantitySelector
                value={quantity}
                onChange={(n) => setQuantity(Math.min(n, Math.max(1, maxForVariant)))}
                min={1}
                max={Math.max(1, maxForVariant)}
                disabled={!canAdd}
              />
            </div>

            {selected && selected.stockQuantity > 0 ? (
              selected.stockQuantity <= 6 ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <Flame className="size-4 shrink-0" />
                  Only {selected.stockQuantity} left — order soon · Delivered in 2–5 days
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="size-4 shrink-0 text-success" />
                  In stock · Delivered in 2–5 days
                </p>
              )
            ) : null}

            <Button
              size="xl"
              variant="cta"
              uppercase
              loading={pending}
              disabled={!canAdd || outOfStock}
              onClick={handleAdd}
              className={cn(justAdded && 'bg-success bg-none')}
            >
              {justAdded ? (
                <>
                  <Check className="size-5" /> Added
                </>
              ) : outOfStock ? (
                'Out of stock'
              ) : canAdd ? (
                <>
                  Add to cart <Price amount={selectedLineTotal} currency={currency} size="sm" />
                </>
              ) : (
                'Unavailable'
              )}
            </Button>
            {/* Sentinel: when this scrolls out of view, the sticky CTA appears. */}
            <div ref={ctaRef} aria-hidden className="h-px" />

            {selected && !canAdd ? (
              <div className="flex flex-col gap-2">
                <ProductPushAlertButton
                  productId={productId}
                  variantId={selected.id}
                  type="BACK_IN_STOCK"
                />
                <BackInStockNotify key={selected.id} variantId={selected.id} />
              </div>
            ) : null}

            {selected && canAdd ? (
              <ProductPushAlertButton productId={productId} variantId={selected.id} />
            ) : null}

            <p className="text-xs text-muted-foreground">
              {remainingForFreeDelivery > 0 ? (
                <>
                  Add <Price amount={remainingForFreeDelivery} currency={currency} size="sm" /> more
                  for free delivery.
                </>
              ) : (
                'Free delivery unlocked for this selection.'
              )}{' '}
              Cash on delivery · 2–3 day returns
            </p>
            <div className="grid gap-2 border-y border-border/70 py-3 text-sm text-muted-foreground sm:grid-cols-2">
              <p className="flex items-start gap-2">
                <Truck className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden />
                <span>
                  <strong className="font-medium text-foreground">Delivery in 2–5 days</strong>
                  <br />
                  Nationwide cash on delivery.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden />
                <span>
                  <strong className="font-medium text-foreground">Checked before dispatch</strong>
                  <br />
                  Returns accepted within 2–3 days.
                </span>
              </p>
            </div>
            <TrustBar />
          </div>

          <Accordion type="multiple" defaultValue={['description', 'shipping']} className="mt-2">
            <AccordionItem value="description">
              <AccordionTrigger>Description</AccordionTrigger>
              <AccordionContent>
                {fullDescription || shortDescription ? (
                  <RichText text={fullDescription ?? shortDescription ?? ''} />
                ) : (
                  'No description yet.'
                )}
              </AccordionContent>
            </AccordionItem>

            {ingredients.length > 0 ? (
              <AccordionItem value="ingredients">
                <AccordionTrigger>Materials &amp; details</AccordionTrigger>
                <AccordionContent>
                  <ul className="flex flex-col gap-2">
                    {ingredients.map((ing) => (
                      <li key={ing.id}>
                        <span className="font-medium text-foreground">{ing.name}</span>
                        {ing.description ? (
                          <span className="text-muted-foreground"> — {ing.description}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ) : null}

            <AccordionItem value="shipping">
              <AccordionTrigger>Shipping &amp; returns</AccordionTrigger>
              <AccordionContent>
                Free delivery on orders over Rs {FREE_SHIPPING_THRESHOLD.toLocaleString('en-US')},
                cash on delivery nationwide. Easy 2–3 day returns on unused items in original
                packaging.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {showSticky && canAdd && !outOfStock ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 shadow-elevated backdrop-blur motion-safe:animate-in motion-safe:slide-in-from-bottom-3">
          <div className="container flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{productName}</p>
              <Price
                amount={currentPrice}
                compareAt={currentCompareAt}
                currency={currency}
                size="sm"
              />
            </div>
            <Button
              size="lg"
              variant="cta"
              uppercase
              loading={pending}
              onClick={handleAdd}
              className="shrink-0"
            >
              Add to bag
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
