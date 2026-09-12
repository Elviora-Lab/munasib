'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Heart, ShoppingBag } from 'lucide-react';

import { routes } from '@/config/routes';
import { siteConfig } from '@/config/site';

import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/format';

import { Rating } from '@/design-system/primitives/rating';
import { Badge } from '@/components/ui/badge';

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  brandLine?: string;
  imageUrl: string;
  hoverImageUrl?: string;
  price: number;
  compareAt?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  isNew?: boolean;
  isBestseller?: boolean;
  /** Optional stock hint — rendered only when the data source provides it. */
  stockState?: 'in' | 'low' | 'out';
};

type ProductCardProps = {
  product: ProductCardData;
  onWishlistToggle?: (productId: string) => void;
  wishlisted?: boolean;
  priority?: boolean;
  className?: string;
  /** Analytics list context — enables GA4 `select_item` when the card is clicked. */
  listId?: string;
  listName?: string;
  index?: number;
  /** 1-based rank stamp (bestseller ledger) — leads the badge stack. */
  rank?: number;
  /**
   * Optional quick-add. `ProductCardData` carries no variant id, so the card
   * can't resolve a cart line on its own — call sites that know the variant
   * wire this up and the CTA becomes a real "Add to cart" button (they own the
   * `add_to_cart` analytics call, same as the PDP). Without it the CTA stays an
   * honest link through to the product page.
   */
  onQuickAdd?: (product: ProductCardData) => void;
  /** Label for the fallback CTA when `onQuickAdd` isn't wired. */
  ctaLabel?: string;
};

/**
 * Munasib product card — built to read as a shop, not a lookbook:
 * price is the loudest thing after the image (ember when discounted, with a
 * struck compare price and a "-XX%" pill), badges are capped at two so the
 * top-left never turns into a sticker wall, and the CTA sits in normal flow at
 * the bottom so it's tappable on touch without hunting for a hover state.
 * Every row that can be empty (rating, savings) reserves its height, so a card
 * with reviews and one without line up in the grid.
 */
export function ProductCard({
  product,
  onWishlistToggle,
  wishlisted,
  priority,
  className,
  listId,
  listName,
  index,
  rank,
  onQuickAdd,
  ctaLabel = 'View product',
}: ProductCardProps) {
  const prefersReduced = useReducedMotion();

  const onSale = typeof product.compareAt === 'number' && product.compareAt > product.price;
  const discountPct = onSale
    ? Math.round(((product.compareAt! - product.price) / product.compareAt!) * 100)
    : 0;
  const saved = onSale ? product.compareAt! - product.price : 0;
  const soldOut = product.stockState === 'out';

  const trackSelect = () =>
    analytics.selectItem({
      listId,
      listName,
      item: {
        item_id: product.id,
        item_name: product.name,
        item_brand: product.brandLine,
        item_list_id: listId,
        item_list_name: listName,
        price: product.price,
        index,
      },
    });

  // Two pills, maximum. Rank outranks the generic "Bestseller" flag (it says the
  // same thing, but with a number), and urgency (low stock) comes last.
  const badges = [
    typeof rank === 'number' ? (
      <Badge key="rank" variant="gold" className="tabular-nums">
        #{String(rank).padStart(2, '0')}
      </Badge>
    ) : product.isBestseller ? (
      <Badge key="bestseller" variant="gold">
        Bestseller
      </Badge>
    ) : null,
    product.isNew ? (
      <Badge key="new" variant="info">
        New
      </Badge>
    ) : null,
    product.stockState === 'low' ? (
      <Badge key="low-stock" variant="deal">
        Low stock
      </Badge>
    ) : null,
  ]
    .filter(Boolean)
    .slice(0, 2);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card',
        'transition-all duration-300 ease-swift hover:border-accent/30 hover:shadow-elevated',
        !prefersReduced && 'hover:-translate-y-1',
        className,
      )}
      // First-party clickstream: any click inside the card resolves to this
      // product via the delegated listener (see @/lib/analytics/clickstream).
      data-track="product"
      data-product-id={product.id}
      data-track-label={product.name}
      {...(typeof index === 'number' ? { 'data-index': index } : {})}
    >
      <Link
        href={routes.productDetail(product.slug)}
        onClick={trackSelect}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-square overflow-hidden bg-white"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            priority={priority}
            sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
            className={cn(
              'object-cover transition-transform duration-500 ease-swift',
              !prefersReduced && 'group-hover:scale-105',
              soldOut && 'grayscale',
              // Hold the primary image back on hover when there's a second shot
              // to swap to, so the two don't cross-fade into mush.
              product.hoverImageUrl && 'group-hover:opacity-0',
            )}
          />
        ) : (
          // Placeholder when no image is attached — keeps the grid intact and
          // avoids `<Image src="">` warnings.
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center font-serif text-2xl font-medium text-brand-navy/30"
          >
            {siteConfig.name}
          </span>
        )}
        {product.hoverImageUrl ? (
          <Image
            src={product.hoverImageUrl}
            alt=""
            fill
            sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
            className={cn(
              'object-cover opacity-0 transition-opacity duration-500 ease-swift group-hover:opacity-100',
              soldOut && 'grayscale',
            )}
            aria-hidden
          />
        ) : null}

        {/* Scrim only under the badge row — enough to keep pills legible on a
            blown-out product shot, not enough to dull the image. */}
        {badges.length > 0 ? (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent"
          />
        ) : null}

        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">{badges}</div>

        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-brand-ink/80 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
            Out of stock
          </span>
        ) : null}
      </Link>

      {onWishlistToggle ? (
        <WishlistButton wishlisted={wishlisted} onToggle={() => onWishlistToggle(product.id)} />
      ) : null}

      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brandLine ? (
          <span className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {product.brandLine}
          </span>
        ) : null}

        <Link
          href={routes.productDetail(product.slug)}
          onClick={trackSelect}
          title={product.name}
          className={cn(
            'line-clamp-2 min-h-[2.4rem] rounded-sm text-sm font-medium leading-snug text-foreground',
            'transition-colors hover:text-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          {/* The image link above is aria-hidden — this is the card's one
              accessible link, so it carries the product name. */}
          {product.name}
        </Link>

        {/* Fixed-height rating slot: reserved whether or not reviews exist, so
            hover and late-loading review counts never nudge the grid. */}
        <div className="flex h-4 items-center">
          {typeof product.rating === 'number' ? (
            <Rating value={product.rating} reviewCount={product.reviewCount} size={13} />
          ) : null}
        </div>

        {/* Price block — the loudest thing on the card after the image. */}
        <div className="mt-auto pt-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                'text-lg font-bold tabular-nums leading-none tracking-tight',
                onSale ? 'text-brand-ember' : 'text-foreground',
              )}
            >
              {formatMoney(product.price, product.currency)}
            </span>
            {onSale ? (
              <span className="text-xs font-medium tabular-nums text-muted-foreground line-through">
                {formatMoney(product.compareAt!, product.currency)}
              </span>
            ) : null}
            {discountPct > 0 ? (
              <Badge variant="deal" className="px-1.5 py-0 text-[10px] font-bold tracking-normal">
                -{discountPct}%
              </Badge>
            ) : null}
          </div>
          {/* Reserved line: keeps sale and full-price cards the same height. */}
          <div className="flex h-4 items-center">
            {saved > 0 ? (
              <span className="text-[11px] font-semibold tabular-nums text-brand-ember">
                Save {formatMoney(saved, product.currency)}
              </span>
            ) : null}
          </div>
        </div>

        <CardCta
          product={product}
          soldOut={soldOut}
          onQuickAdd={onQuickAdd}
          ctaLabel={ctaLabel}
          onNavigate={trackSelect}
        />
      </div>
    </article>
  );
}

/**
 * The card's buy affordance. Always in normal flow and always visible — a
 * hover-revealed bar is invisible on every phone, which is most of the traffic.
 * Renders a real <button> when a quick-add handler exists, otherwise a link
 * through to the PDP (where variants and stock actually get resolved).
 */
function CardCta({
  product,
  soldOut,
  onQuickAdd,
  ctaLabel,
  onNavigate,
}: {
  product: ProductCardData;
  soldOut: boolean;
  onQuickAdd?: (product: ProductCardData) => void;
  ctaLabel: string;
  onNavigate: () => void;
}) {
  const base = cn(
    'mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-3',
    'text-xs font-semibold uppercase tracking-[0.1em]',
    'transition-all duration-300 ease-swift',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  );

  if (soldOut) {
    return (
      <span aria-disabled className={cn(base, 'cursor-not-allowed bg-muted text-muted-foreground')}>
        Sold out
      </span>
    );
  }

  if (onQuickAdd) {
    return (
      <button
        type="button"
        onClick={() => onQuickAdd(product)}
        // Override the card's product tracking so an add logs as its own CTA.
        data-track="cta"
        data-track-label="quick-add"
        className={cn(base, 'bg-gradient-ember text-white shadow-soft hover:shadow-elevated')}
      >
        <ShoppingBag className="size-4" aria-hidden />
        Add to cart
      </button>
    );
  }

  return (
    <Link
      href={routes.productDetail(product.slug)}
      onClick={onNavigate}
      className={cn(base, 'bg-gradient-ember text-white shadow-soft hover:shadow-elevated')}
    >
      {ctaLabel}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/**
 * Wishlist heart:
 *  - Visible at rest on touch devices (no hover state on phones).
 *  - Tap pulse + pop-in fill for tactile feedback.
 *  - Visible focus ring for keyboard users.
 */
function WishlistButton({ wishlisted, onToggle }: { wishlisted?: boolean; onToggle: () => void }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      whileTap={prefersReduced ? undefined : { scale: 0.85 }}
      // Override the card's product tracking so a wishlist tap logs as its own CTA.
      data-track="cta"
      data-track-label="wishlist-toggle"
      className={cn(
        'absolute right-2 top-2 grid size-11 place-items-center rounded-full',
        'border border-border bg-background/90 shadow-soft backdrop-blur-md',
        // Always visible on touch; hover-revealed on lg+.
        'opacity-100 lg:opacity-0 lg:group-hover:opacity-100',
        'transition-all duration-300 hover:scale-110',
        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        wishlisted && 'lg:opacity-100',
      )}
      aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={!!wishlisted}
    >
      <Heart
        className={cn(
          'size-4 transition-colors',
          wishlisted ? 'animate-pop-in fill-destructive text-destructive' : 'text-foreground/70',
        )}
      />
    </motion.button>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="shimmer aspect-square bg-muted/60" />
      <div className="flex flex-col gap-2 p-4">
        <div className="shimmer h-3 w-20 rounded bg-muted/60" />
        <div className="shimmer h-4 w-3/4 rounded bg-muted/60" />
        <div className="shimmer h-4 w-24 rounded bg-muted/60" />
        <div className="shimmer h-5 w-1/3 rounded bg-muted/60" />
        {/* Matches the CTA's 44px so the swap from skeleton to card is silent. */}
        <div className="shimmer mt-1 h-11 w-full rounded-lg bg-muted/60" />
      </div>
    </div>
  );
}
