'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/cn';

import { Price } from '@/design-system/primitives/price';

export type HeroProduct = {
  slug: string;
  name: string;
  imageUrl: string;
  price: number;
  brandLine?: string;
  /** Both are already on `ProductCardData` — no invented fields. */
  compareAt?: number;
  isBestseller?: boolean;
};

/** GA4 promotion payload for a hero card (each card is a merchandising slot). */
function heroPromo(p: HeroProduct, index: number) {
  return {
    promotionId: p.slug,
    promotionName: p.name,
    creativeName: 'hero',
    creativeSlot: `home_hero_${index}`,
    items: [{ item_id: p.slug, item_name: p.name, item_brand: p.brandLine, price: p.price, index }],
  };
}

function discountPct(p: HeroProduct) {
  return typeof p.compareAt === 'number' && p.compareAt > p.price
    ? Math.round(((p.compareAt - p.price) / p.compareAt) * 100)
    : 0;
}

/**
 * A scattered "photo cluster" — one large shoppable card fanned out over two
 * smaller ones at gentle opposing angles, like snapshots casually stacked on
 * a table. Replaces the old single rotating glossy carousel: that pattern
 * (one auto-advancing "hero slide" with a numbered thumbnail rail) is the
 * generic e-commerce template shape, and swapping its colors/fonts alone
 * never stopped it from reading that way. A static, confident cluster reads
 * calmer and warmer — no autoplay motion to fight for attention.
 */
export function HeroShowcase({ products }: { products: HeroProduct[] }) {
  const cards = products.slice(0, 3);

  // GA4 view_promotion — every visible card is an impression, fired once.
  useEffect(() => {
    cards.forEach((p, i) => analytics.viewPromotion(heroPromo(p, i)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((p) => p.slug).join(',')]);

  if (cards.length === 0) return null;

  const primary = cards[0]!;
  const rest = cards.slice(1);

  return (
    <div className="relative">
      {/* Colour bloom behind the cluster. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-8 -top-10 size-56 rounded-full bg-brand-ember/20 blur-3xl md:size-72" />
        <div className="absolute -bottom-12 -left-8 size-48 rounded-full bg-brand-teal/20 blur-3xl md:size-64" />
      </div>

      <div className="relative">
        <HeroCard product={primary} index={0} primary className="aspect-[16/10] rotate-0" />

        {rest.length > 0 ? (
          <div className="relative mt-4 flex gap-4 px-4 sm:mt-5 sm:gap-5 sm:px-8">
            {rest.map((p, i) => (
              <HeroCard
                key={p.slug}
                product={p}
                index={i + 1}
                className={cn('aspect-square flex-1', i % 2 === 0 ? '-rotate-3' : 'rotate-3')}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeroCard({
  product,
  index,
  primary,
  className,
}: {
  product: HeroProduct;
  index: number;
  primary?: boolean;
  className?: string;
}) {
  const off = discountPct(product);

  return (
    <Link
      href={`/products/${product.slug}`}
      onClick={() => analytics.selectPromotion(heroPromo(product, index))}
      data-track="banner"
      data-track-id={product.slug}
      data-track-label={product.name}
      data-index={index}
      className={cn(
        'group relative z-0 block overflow-hidden rounded-[2rem] border-[6px] border-white bg-white shadow-pop',
        'transition-transform duration-300 ease-swift hover:z-10 hover:-translate-y-1.5 hover:rotate-0',
        className,
      )}
    >
      <Image
        src={product.imageUrl}
        alt={product.name}
        fill
        priority={primary}
        fetchPriority={primary ? 'high' : 'auto'}
        loading={primary ? undefined : 'lazy'}
        sizes={primary ? '(min-width:1024px) 55vw, 100vw' : '(min-width:1024px) 26vw, 46vw'}
        className="object-cover"
      />

      <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
        {off > 0 ? (
          <span className="rounded-full bg-gradient-ember px-3 py-1 text-xs font-bold tracking-wide text-white shadow-card">
            −{off}% off
          </span>
        ) : null}
        {product.isBestseller && primary ? (
          <span className="rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-navy shadow-soft">
            Bestseller
          </span>
        ) : null}
      </div>

      {/* Flush to the card's bottom/side edges (no inset) — an inset here
          would leave a sliver of the raw photo exposed below the card, which
          on some supplier photos has text baked directly into the image (see
          the same fix in category-bento.tsx). */}
      {primary ? (
        <div className="absolute inset-x-0 bottom-0 rounded-b-[1.7rem] rounded-t-2xl border-t border-white/25 bg-background/85 p-3 shadow-elevated backdrop-blur-md sm:p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              {product.brandLine ? (
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {product.brandLine}
                </span>
              ) : null}
              <span className="block truncate text-lg font-semibold leading-snug sm:text-xl">
                {product.name}
              </span>
              <Price
                amount={product.price}
                compareAt={product.compareAt}
                currency="PKR"
                size="lg"
                showSavings
                className="mt-1"
              />
            </div>
            <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-gradient-ember px-4 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-card transition-all duration-300 ease-swift group-hover:brightness-110 sm:px-6 sm:text-sm">
              <span className="hidden sm:inline">Shop now</span>
              <ArrowRight className="size-4 transition-transform duration-300 ease-swift group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      ) : null}
    </Link>
  );
}
