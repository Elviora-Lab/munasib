'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { ProductCard, type ProductCardData } from '@/design-system/patterns/product-card';
import { Reveal } from '@/design-system/primitives/reveal';
import { SectionHeading } from '@/design-system/primitives/section';
import { SnapRail } from '@/components/commerce/snap-rail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TabKey = 'bestsellers' | 'newArrivals';

type ProductTabsProps = {
  bestsellers: ProductCardData[];
  newArrivals: ProductCardData[];
  /** Authoritative count of active products — feeds the bestseller end-cap label. */
  productCount: number;
};

const COPY: Record<
  TabKey,
  {
    eyebrow: string;
    title: string;
    description: string;
    seeAllHref: string;
    seeAllLabel: string;
    railLabel: string;
    listId: string;
    listName: string;
  }
> = {
  bestsellers: {
    eyebrow: 'Proven by repeat orders',
    title: 'The bestseller ledger',
    description: 'Ranked by real orders — the things customers come back for.',
    seeAllHref: '/products?sort=best-sellers',
    seeAllLabel: 'See the full ledger →',
    railLabel: 'Best sellers',
    listId: 'home_bestsellers',
    listName: 'Home — Best sellers',
  },
  newArrivals: {
    eyebrow: 'Fresh this week',
    title: 'Just landed',
    description: 'The newest additions to the shelf.',
    seeAllHref: '/products?sort=newly-added',
    seeAllLabel: 'Everything new →',
    railLabel: 'New arrivals',
    listId: 'home_new_arrivals',
    listName: 'Home — New arrivals',
  },
};

/**
 * Bestsellers and New arrivals used to be two nearly-identical stacked
 * sections — same grid/rail/end-cap shape, just a different array. Merged
 * into one tabbed section so both are one click away instead of a full extra
 * scroll of the homepage. The heading (eyebrow/title/description) is shared
 * and swaps with the active tab, driven by local state so `SectionHeading`
 * only has to be written once.
 */
export function ProductTabs({ bestsellers, newArrivals, productCount }: ProductTabsProps) {
  const [active, setActive] = useState<TabKey>('bestsellers');
  const copy = COPY[active];
  const arrivals = newArrivals.slice(0, 8).map((p) => ({ ...p, isNew: true }));
  const topSellers = bestsellers.slice(0, 8);

  return (
    <Tabs
      value={active}
      onValueChange={(v) => setActive(v as TabKey)}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
        <div className="flex flex-col items-end gap-3">
          <TabsList>
            <TabsTrigger value="bestsellers">Bestsellers</TabsTrigger>
            <TabsTrigger value="newArrivals">New arrivals</TabsTrigger>
          </TabsList>
          <Link
            href={copy.seeAllHref}
            className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {copy.seeAllLabel}
          </Link>
        </div>
      </div>

      <TabsContent value="bestsellers" className="mt-0">
        {/* Desktop: ranked grid. */}
        <div className="hidden grid-cols-3 gap-5 md:grid lg:grid-cols-4">
          {topSellers.map((product, i) => (
            <Reveal key={product.id} inView delay={(i % 4) * 0.06}>
              <ProductCard
                product={product}
                listId={COPY.bestsellers.listId}
                listName={COPY.bestsellers.listName}
                index={i}
                rank={i < 3 ? i + 1 : undefined}
              />
            </Reveal>
          ))}
        </div>

        {/* Mobile: snap rail with progress thread + end-cap. */}
        <div className="md:hidden">
          <SnapRail ariaLabel={COPY.bestsellers.railLabel} itemClassName="w-[72vw] max-w-72">
            {[
              ...topSellers.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  listId={COPY.bestsellers.listId}
                  listName={COPY.bestsellers.listName}
                  index={i}
                  rank={i < 3 ? i + 1 : undefined}
                />
              )),
              <EndCap
                key="endcap"
                href={COPY.bestsellers.seeAllHref}
                label={`See all ${productCount.toLocaleString('en-US')}`}
              />,
            ]}
          </SnapRail>
        </div>
      </TabsContent>

      <TabsContent value="newArrivals" className="mt-0">
        {/* Desktop: ranked grid. */}
        <div className="hidden grid-cols-3 gap-5 md:grid lg:grid-cols-4">
          {arrivals.map((product, i) => (
            <Reveal key={product.id} inView delay={(i % 4) * 0.06}>
              <ProductCard
                product={product}
                listId={COPY.newArrivals.listId}
                listName={COPY.newArrivals.listName}
                index={i}
              />
            </Reveal>
          ))}
        </div>

        {/* Mobile: snap rail with progress thread + end-cap. */}
        <div className="md:hidden">
          <SnapRail ariaLabel={COPY.newArrivals.railLabel} itemClassName="w-[72vw] max-w-72">
            {[
              ...arrivals.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  listId={COPY.newArrivals.listId}
                  listName={COPY.newArrivals.listName}
                  index={i}
                />
              )),
              <EndCap key="endcap" href={COPY.newArrivals.seeAllHref} label="View all new" />,
            ]}
          </SnapRail>
        </div>
      </TabsContent>
    </Tabs>
  );
}

/** Rail end-cap — the "see everything" card that closes a snap rail. */
function EndCap({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-full min-h-72 w-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-accent/50 bg-card text-center transition-colors hover:border-accent hover:bg-accent/5"
    >
      <span className="grid size-11 place-items-center rounded-full bg-accent/10 text-accent">
        <ArrowRight className="size-5" />
      </span>
      <span className="px-3 text-sm font-semibold text-accent">{label}</span>
    </Link>
  );
}
