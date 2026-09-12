import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/cn';

export type BentoCategory = {
  name: string;
  href: string;
  blurb?: string | null;
  img?: string | null;
  children?: string[];
  /**
   * Optional catalogue size for the "N items" affordance. The homepage does not
   * currently pass it (the category tree carries no count), so the tile falls
   * back to sub-collections and finally to a plain "Shop all" — never a zero.
   */
  count?: number | null;
};

/**
 * Asymmetric category bento — data-driven "doors" so an intent-holding shopper
 * self-routes in one viewport. Server component, zero client JS: every
 * micro-interaction is CSS (tile lift, image zoom, scrim deepen, arrow slide),
 * and each one carries a `motion-reduce` escape hatch so a reduced-motion
 * shopper gets the same layout with none of the movement.
 *
 * The shape is deliberately uneven — a hero tile carrying half the grid beside
 * a wide tile and two squares — because four identical rectangles read as a
 * spec sheet, not a storefront. Mobile stacks the hero full-bleed over a 2×2 of
 * the rest, so all four doors still fit one thumb-scroll at 390px.
 */
export function CategoryBento({ categories }: { categories: BentoCategory[] }) {
  const cats = categories.slice(0, 4);
  if (cats.length === 0) return null;

  // Desktop shape on a 4×2 grid: [0] hero across cols 1–2 / both rows, [1] wide
  // across the top right, [2] and [3] squares beneath it. Auto-placement lands
  // these correctly in order, so no explicit column starts are needed.
  const areaClasses = [
    'col-span-2 lg:col-span-2 lg:row-span-2', // hero
    'col-span-2 lg:col-span-2 lg:row-span-1', // wide
    'lg:col-span-1 lg:row-span-1',
    'lg:col-span-1 lg:row-span-1',
  ];

  // Each tile renders at a different width, so `sizes` is per-slot rather than
  // one shared guess — the hero and the squares differ by ~2× on desktop.
  const imageSizes = [
    '(min-width:1024px) 46vw, 100vw',
    '(min-width:1024px) 46vw, 100vw',
    '(min-width:1024px) 23vw, 50vw',
    '(min-width:1024px) 23vw, 50vw',
  ];

  // Tiles 2+ pair up two-across on mobile. An odd number of them would leave a
  // half-width orphan on the last row, so that one is widened instead.
  const squareCount = Math.max(cats.length - 2, 0);
  const orphanIndex = squareCount % 2 === 1 ? cats.length - 1 : -1;

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4 lg:grid-rows-2">
      {cats.map((c, i) => {
        const isHero = i === 0;
        const isWide = i <= 1;
        // Count line, most specific signal first. Anything falsy collapses to
        // the neutral "Shop all" rather than rendering "0 items".
        const countLabel =
          typeof c.count === 'number' && c.count > 0
            ? `${c.count} item${c.count === 1 ? '' : 's'}`
            : c.children && c.children.length > 0
              ? `${c.children.length} collection${c.children.length === 1 ? '' : 's'}`
              : 'Shop all';

        return (
          <Link
            key={c.href}
            href={c.href}
            data-track="nav"
            data-track-label={`bento:${c.name}`}
            className={cn(
              'group relative isolate block overflow-hidden rounded-[1.75rem] border border-border bg-brand-sand',
              'transition-all duration-300 ease-swift hover:-translate-y-1.5 hover:border-brand-ember/40 hover:shadow-pop',
              'active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              // Mobile heights: full-width tiles get a landscape frame, the
              // paired ones stay square. Desktop hands height to the grid rows.
              isHero ? 'aspect-[16/11] sm:aspect-[2/1]' : isWide ? 'aspect-[2/1]' : 'aspect-square',
              'lg:aspect-auto',
              isHero ? 'lg:min-h-[27rem]' : 'lg:min-h-[13rem]',
              areaClasses[i],
              i === orphanIndex && 'col-span-2 aspect-[2/1] lg:aspect-auto',
            )}
          >
            {c.img ? (
              <Image
                src={c.img}
                alt={c.name}
                fill
                loading="lazy"
                sizes={imageSizes[i]}
                className="duration-[600ms] object-cover transition-transform ease-swift group-hover:scale-[1.07] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            ) : (
              // No image on file — a warm mint→green wash still reads as a
              // real tile, on-brand instead of the old moody navy fallback.
              <div className="absolute inset-0 bg-gradient-to-br from-brand-mist via-brand-sand to-brand-stone" />
            )}

            {/* A soft light-to-transparent lift at the very foot of the photo,
                just enough for the floating caption card below to sit on a
                gently graded edge rather than a hard photo cutoff. No dark
                scrim — the caption card itself, not an overlay, carries the
                text contrast now. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/10 to-transparent"
            />

            {/* Floating rounded caption card — a friendlier "sticker" label
                instead of text stamped directly onto a darkened photo. Flush
                to the tile's bottom/side edges (bottom-0, inset-x-0) rather
                than floating with a margin — a margin here would leave a
                sliver of the raw photo exposed below the card, which on some
                supplier photos has text baked directly into the image. */}
            <div
              className={cn(
                'absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-b-[1.75rem] rounded-t-2xl bg-card/95 p-4 shadow-card backdrop-blur-sm',
                'transition-transform duration-300 ease-swift group-hover:-translate-y-1',
                'motion-reduce:transition-none motion-reduce:group-hover:translate-y-0',
                isHero && 'md:p-6',
              )}
            >
              {c.blurb ? (
                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  {c.blurb}
                </span>
              ) : null}

              <span
                className={cn(
                  'w-fit font-serif font-semibold leading-[1.05] tracking-tight text-foreground',
                  isHero ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-lg md:text-xl',
                )}
              >
                {c.name}
              </span>

              {/* Count + arrow share a baseline: the count states the payoff,
                  the arrow states the action. */}
              <span className="flex items-center justify-between gap-2.5">
                <span className="rounded-full bg-brand-mist px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-teal">
                  {countLabel}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full bg-brand-ember text-sm text-white',
                    'transition-all duration-300 ease-snappy group-hover:translate-x-1 group-hover:shadow-glow',
                    'motion-reduce:transition-none motion-reduce:group-hover:translate-x-0',
                  )}
                >
                  →
                </span>
              </span>

              {c.children?.length ? (
                <span className="hidden flex-wrap gap-1.5 lg:flex">
                  {c.children.slice(0, isHero ? 4 : 2).map((child) => (
                    <span
                      key={child}
                      className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {child}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
