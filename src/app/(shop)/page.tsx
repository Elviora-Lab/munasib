import Link from 'next/link';
import { ArrowRight, BadgeCheck, RotateCcw, ShieldCheck, Star, Truck } from 'lucide-react';

import { categorySeo } from '@/config/category-seo';
import { routes } from '@/config/routes';
import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping';

import { ProductCard } from '@/design-system/patterns/product-card';
import { CountUp } from '@/design-system/primitives/count-up';
import { Rating } from '@/design-system/primitives/rating';
import { Reveal } from '@/design-system/primitives/reveal';
import { Section, SectionHeading } from '@/design-system/primitives/section';
import { FreeDeliveryBanner } from '@/components/commerce/free-delivery-banner';
import { PromoCodeChip } from '@/components/commerce/promo-code-chip';
import { SnapRail } from '@/components/commerce/snap-rail';
import { Button } from '@/components/ui/button';

import { CategoryBento } from './_components/category-bento';
import { CodSteps } from './_components/cod-steps';
import { FlashSaleSection } from './_components/flash-sale-section';
import { HeroShowcase } from './_components/hero-showcase';
import { getShowcaseReviews } from './_components/homepage-modules.data';
import { ReviewsCarousel } from './_components/reviews-carousel';
import { SavingsLadder } from './_components/savings-ladder';
import { StatementMarquee } from './_components/statement-marquee';
import { ValuePicks } from './_components/value-picks';

import { reviewsRepo } from '@/server/repositories/reviews.repo';
import { categoriesService } from '@/server/services/categories.service';
import { flashSaleService } from '@/server/services/flash-sale.service';
import { productsService } from '@/server/services/products.service';
import { promotionsService } from '@/server/services/promotions.service';

/**
 * Homepage positioning is deliberately NOT kitchen-only. The brand name reads
 * as kitchenware, but the catalog spans home, living, baby, beauty, gadgets,
 * wardrobe, decor and mobile accessories — anchoring the homepage on "kitchen
 * accessories" would cap the topical ceiling of the entire domain and force a
 * rebuild the next time a category is added. Kitchen stays the strongest
 * cluster; it just does not define the site.
 */
export const metadata = buildMetadata({
  // "Online in Pakistan" over a bare "in Pakistan": the modifier matches how
  // the commercial queries are actually typed ("home products online pakistan",
  // "online shopping pakistan"), and the head term stays at the front where it
  // carries most weight. At 66 characters the trailing brand may be clipped in
  // desktop SERPs — an accepted trade, since brand queries resolve on the
  // domain and Organization schema rather than on the title tag.
  title: 'Home, Kitchen & Everyday Essentials Online in Pakistan',
  description:
    'Shop practical home, kitchen and everyday essentials online in Pakistan — organizers, gadgets, baby, beauty and decor. Cash on delivery, free over Rs 3,300.',
  path: '/',
  keywords: [...siteConfig.keywords],
});

// ISR — the homepage is the same for everyone; revalidate periodically so new
// bestsellers surface without rendering fresh on every request.
export const revalidate = 3600;

const FREE_DELIVERY_AT = FREE_SHIPPING_THRESHOLD;

/**
 * "The Honest Ledger" — a decision-journey homepage. The order is the
 * psychology: promise (ticker, in the layout) → attention (hero) → trust
 * (ledger) → routing (bento) → consensus (ranked bestsellers) → economics
 * (savings ladder) → concrete route up the ladder (bundles) → freshness
 * (arrivals) → human proof (navy proof wall) → peak-end close (marquee + COD
 * ritual + gift restated). Every number is fetched or published policy;
 * ember orange appears only on money moments.
 */
export default async function HomePage() {
  // Resilient at build/runtime: a DB hiccup yields an empty section rather
  // than a crashed render; ISR repopulates on the next successful revalidate.
  const [
    { items: bestsellers, total: productCount },
    { items: newArrivals },
    categoryTree,
    { items: bundles },
    reviews,
    reviewSummary,
    spendTiers,
    flashSale,
  ] = await Promise.all([
    productsService.list({}, 'best-sellers', 1, 8).catch(() => ({ items: [], total: 0 })),
    productsService.list({}, 'newly-added', 1, 8).catch(() => ({ items: [], total: 0 })),
    categoriesService.tree().catch(() => []),
    productsService
      .list({ category: 'best-selling' }, 'newly-added', 1, 4)
      .catch(() => ({ items: [], total: 0 })),
    getShowcaseReviews(12).catch(() => []),
    reviewsRepo.globalSummary().catch(() => ({ average: 0, count: 0 })),
    promotionsService.tiersForDisplay().catch(() => []),
    flashSaleService.liveForDisplay().catch(() => null),
  ]);

  // Every top-level category is merchandisable. This used to require
  // `children.length > 0`, which silently emptied the whole bento once the
  // catalog moved to a flat one-level taxonomy — the guard below then hid the
  // section with no error. Only the "uncategorized" holding pen is excluded.
  const merchandising = categoryTree.filter((c) => c.slug !== 'uncategorized');
  const categoryImages = await Promise.all(
    merchandising.map((c) =>
      c.image
        ? Promise.resolve(c.image)
        : productsService
            .list({ category: c.slug }, 'best-sellers', 1, 1)
            .then((r) => r.items[0]?.imageUrl ?? null)
            .catch(() => null),
    ),
  );
  const bentoCategories = merchandising.map((c, i) => ({
    name: c.name,
    href: routes.category(c.slug),
    // `categories.description` is NULL for every row, so the tiles rendered
    // with no caption at all. Fall back to the hand-written hook.
    blurb: c.description ?? categorySeo(c.slug)?.blurb ?? null,
    img: categoryImages[i],
    children: c.children.map((child) => child.name),
  }));

  const heroProducts = bestsellers
    .filter((p) => p.imageUrl)
    .slice(0, 4)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      imageUrl: p.imageUrl,
      price: p.price,
      brandLine: p.brandLine,
      // Commerce signal for the hero card — both already projected onto
      // ProductCardData by the list mapper.
      compareAt: p.compareAt,
      isBestseller: p.isBestseller,
    }));

  // Social proof is only honest at volume — below 30 reviews the hero line
  // and the "rated by" framing stay silent.
  const proofGate = reviewSummary.count >= 30;
  const ladderTiers = spendTiers;

  return (
    <>
      {/* ——— Hero — headline, offer, and the shoppable spotlight ——— */}
      <Section
        as="section"
        size="sm"
        className="surface-cloud relative overflow-hidden pb-20 pt-8 md:pb-28 md:pt-12"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/4 size-[26rem] rounded-full bg-brand-mist/70 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-10 size-[20rem] rounded-full bg-brand-stone/40 blur-3xl"
        />
        <div className="container relative grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="flex flex-col items-start gap-5 lg:col-span-5">
            {/* Live-dot pill instead of a bare eyebrow — reads as an active shop,
                not a lookbook chapter marker. */}
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-stone bg-white/70 py-1.5 pl-2.5 pr-3.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-ember/70 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-brand-ember" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-navy">
                Kitchen · Home · Everyday
              </span>
            </span>

            {/* Sans/serif contrast with an ember swash under the pivot word —
                the headline has to land before the eye reaches the image. */}
            <h1 className="text-balance text-display-xl leading-[1.02] md:text-display-2xl">
              <span className="editorial-heading">Everything your</span>{' '}
              <span className="relative inline-block font-sans font-extrabold tracking-[-0.035em] text-brand-navy">
                home
                <svg
                  aria-hidden
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                  className="absolute inset-x-0 -bottom-1 h-[0.28em] w-full text-brand-ember"
                >
                  <path
                    d="M3 10C48 4 118 3 197 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{' '}
              <span className="editorial-heading">runs on.</span>
            </h1>

            <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              Smart kitchen &amp; home essentials — chosen for build quality, delivered anywhere in
              Pakistan, cash at your door.
            </p>

            <PromoCodeChip />

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="xl" variant="cta" uppercase className="w-full sm:w-auto">
                <Link href="/products?sort=best-sellers">
                  Shop best sellers <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="w-full sm:w-auto">
                <Link href="/categories">Browse categories</Link>
              </Button>
            </div>

            {/* Store-wide rating — the catalog carries no per-product rating, so
                this stays framed as the shop's score, not the hero item's. */}
            {proofGate ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <Rating value={reviewSummary.average} size={16} />
                <span className="font-semibold text-foreground">
                  {reviewSummary.average.toFixed(1)}/5
                </span>
                from {reviewSummary.count.toLocaleString('en-US')} verified shoppers
              </p>
            ) : null}
          </div>

          <div className="lg:col-span-7">
            <HeroShowcase products={heroProducts} freeDeliveryAt={FREE_DELIVERY_AT} />
          </div>
        </div>
      </Section>

      {/* ——— Trust ledger — all four claims at once, lifted onto the hero's
          bottom edge so it reads as one deliberate card rather than a strip ——— */}
      <div className="relative z-10 -mt-12 md:-mt-16">
        <div className="container">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 shadow-pop md:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Cash on delivery', sub: 'Nationwide' },
              { icon: RotateCcw, title: 'Easy returns', sub: 'Within 2–3 days' },
              { icon: Truck, title: 'Free delivery', sub: 'Over Rs 3,300' },
            ].map((s, i) => (
              <Reveal key={s.title} inView delay={i * 0.06} className="bg-card">
                <div className="flex h-full min-h-11 items-center gap-3 px-4 py-5 transition-colors duration-300 ease-swift hover:bg-brand-mist/40 md:justify-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-mist text-brand-teal ring-1 ring-inset ring-brand-teal/15">
                    <s.icon className="size-5" />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{s.sub}</span>
                  </span>
                </div>
              </Reveal>
            ))}
            <Reveal inView delay={0.18} className="bg-card">
              <div className="flex h-full min-h-11 items-center gap-3 px-4 py-5 transition-colors duration-300 ease-swift hover:bg-brand-amber/5 md:justify-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-amber/15 text-brand-amber ring-1 ring-inset ring-brand-amber/25">
                  {proofGate ? (
                    <Star className="size-5 fill-current" />
                  ) : (
                    <BadgeCheck className="size-5" />
                  )}
                </span>
                <span className="flex flex-col leading-tight">
                  {proofGate ? (
                    <>
                      <span className="text-sm font-semibold">
                        {reviewSummary.average.toFixed(1)}★ from{' '}
                        <CountUp value={reviewSummary.count} duration={1200} suffix="+" /> reviews
                      </span>
                      <span className="text-xs text-muted-foreground">Verified orders</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold">Quality checked</span>
                      <span className="text-xs text-muted-foreground">Before dispatch</span>
                    </>
                  )}
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      <Section id="free-delivery" size="sm" className="scroll-mt-56 py-10 md:scroll-mt-64 md:py-12">
        <div className="container">
          <FreeDeliveryBanner variant="home" />
        </div>
      </Section>

      {/* ——— Flash sale — urgency, straight after the trust ledger ——— */}
      {flashSale && <FlashSaleSection sale={flashSale} />}

      {/* ——— Category bento — four doors, one viewport ——— */}
      {bentoCategories.length > 0 && (
        <Section size="sm" className="py-14 md:py-20">
          <div className="container flex flex-col gap-8">
            <SectionHeading
              eyebrow="Find your fit"
              title="Shop by what your home needs"
              description="Kitchen and storage, home and cleaning, wardrobe, beauty, baby, gadgets and decor — every shelf, one click away."
            />
            <CategoryBento categories={bentoCategories} />
          </div>
        </Section>
      )}

      {/* ——— The bestseller ledger — ranked consensus ——— */}
      {bestsellers.length > 0 && (
        <Section className="border-t border-border/60 bg-muted/50">
          <div className="container flex flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="Proven by repeat orders"
                title="The bestseller ledger"
                description="Ranked by real orders — the things customers come back for."
              />
              <Link
                href="/products?sort=best-sellers"
                className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                See the full ledger →
              </Link>
            </div>

            {/* Desktop: ranked grid. */}
            <div className="hidden grid-cols-3 gap-5 md:grid lg:grid-cols-4">
              {bestsellers.slice(0, 8).map((product, i) => (
                <Reveal key={product.id} inView delay={(i % 4) * 0.06}>
                  <ProductCard
                    product={product}
                    listId="home_bestsellers"
                    listName="Home — Best sellers"
                    index={i}
                    rank={i < 3 ? i + 1 : undefined}
                  />
                </Reveal>
              ))}
            </div>

            {/* Mobile: snap rail with progress thread + end-cap. */}
            <div className="md:hidden">
              <SnapRail ariaLabel="Best sellers" itemClassName="w-[72vw] max-w-72">
                {[
                  ...bestsellers
                    .slice(0, 8)
                    .map((product, i) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        listId="home_bestsellers"
                        listName="Home — Best sellers"
                        index={i}
                        rank={i < 3 ? i + 1 : undefined}
                      />
                    )),
                  <EndCap
                    key="endcap"
                    href="/products?sort=best-sellers"
                    label={`See all ${productCount.toLocaleString('en-US')}`}
                  />,
                ]}
              </SnapRail>
            </div>
          </div>
        </Section>
      )}

      {/* ——— Spend & Save ladder — the economics, before the cart ——— */}
      <Section id="savings" size="sm" className="surface-mist scroll-mt-24 py-14 md:py-20">
        <div className="container">
          <SavingsLadder tiers={ladderTiers} freeDeliveryAt={FREE_DELIVERY_AT} />
        </div>
      </Section>

      {/* ——— Worth-it picks — a concrete route up the ladder ——— */}
      {bundles.length > 0 && (
        <Section className="surface-cloud border-t border-border/60">
          <div className="container flex flex-col gap-8">
            <SectionHeading
              eyebrow="Curated for value"
              title="Picks that pull their weight"
              description="Popular together — and a shortcut past the free-delivery line."
            />
            <ValuePicks products={bundles} />
          </div>
        </Section>
      )}

      {/* ——— Just landed — freshness, with restraint ——— */}
      {newArrivals.length > 0 && (
        <Section size="sm" className="py-14 md:py-20">
          <div className="container flex flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="Fresh this week"
                title="Just landed"
                description="The newest additions to the shelf."
              />
              <Link
                href="/products?sort=newly-added"
                className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                Everything new →
              </Link>
            </div>

            {/* Desktop: one restrained row. */}
            <div className="hidden grid-cols-4 gap-5 md:grid">
              {newArrivals.slice(0, 4).map((product, i) => (
                <Reveal key={product.id} inView delay={i * 0.06}>
                  <ProductCard
                    product={{ ...product, isNew: true }}
                    listId="home_new_arrivals"
                    listName="Home — New arrivals"
                    index={i}
                  />
                </Reveal>
              ))}
            </div>

            {/* Mobile: full rail of 8. */}
            <div className="md:hidden">
              <SnapRail ariaLabel="New arrivals" itemClassName="w-[72vw] max-w-72">
                {[
                  ...newArrivals
                    .slice(0, 8)
                    .map((product, i) => (
                      <ProductCard
                        key={product.id}
                        product={{ ...product, isNew: true }}
                        listId="home_new_arrivals"
                        listName="Home — New arrivals"
                        index={i}
                      />
                    )),
                  <EndCap key="endcap" href="/products?sort=newly-added" label="View all new" />,
                ]}
              </SnapRail>
            </div>
          </div>
        </Section>
      )}

      {/* ——— The proof wall — human voices on the navy chapter ——— */}
      {reviews.length > 0 && (
        <Section className="surface-navy">
          <div className="container grid items-center gap-10 lg:grid-cols-12">
            <Reveal
              inView
              className="flex flex-col items-center gap-3 text-center lg:col-span-4 lg:items-start lg:text-left"
            >
              <span className="eyebrow">From real homes</span>
              <div className="flex items-baseline gap-2 font-serif">
                <span className="text-7xl font-semibold leading-none md:text-8xl">
                  <CountUp value={reviewSummary.average} decimals={1} duration={900} />
                </span>
                <Star className="size-8 fill-brand-amber text-brand-amber" />
              </div>
              <StarMeter average={reviewSummary.average} />
              <p className="text-sm text-muted-foreground">
                from <CountUp value={reviewSummary.count} duration={900} /> verified reviews
              </p>
              <p className="text-xs text-muted-foreground">
                Cash on delivery · Easy 2–3 day returns
              </p>
            </Reveal>
            <div className="lg:col-span-8">
              <ReviewsCarousel reviews={reviews} />
            </div>
          </div>
        </Section>
      )}

      {/* ——— The last word — marquee, COD ritual, peak-end close ——— */}
      <StatementMarquee />
      <Section className="surface-navy border-t border-border/40">
        <div className="container flex flex-col gap-12">
          <SectionHeading
            eyebrow="How buying works"
            title="Pay when it's in your hands."
            description="No card needed, nothing to trust up front — the money leaves your pocket only at your door."
          />
          <CodSteps />
          <Reveal inView className="flex flex-col items-center gap-5 pt-2 text-center">
            <p className="editorial-heading text-display-sm">
              {/* `productCount` is an authoritative COUNT of active products,
                  so the number is real rather than a hardcoded claim. The
                  fallback covers only a catalog-service failure, where evergreen
                  copy beats admitting we could not count our own shelves. */}
              {productCount > 0 ? (
                <>
                  <CountUp value={productCount} suffix="+" /> essentials, one promise — worth the
                  drawer space.
                </>
              ) : (
                'Hundreds of essentials, one promise — worth the drawer space.'
              )}
            </p>
            <PromoCodeChip className="border-brand-cloud/30 bg-card/60" />
            <Button asChild size="xl" variant="cta" uppercase>
              <Link href="/products">
                Start shopping <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </Section>
    </>
  );
}

/** Five-star meter whose fill width equals the real average — no rounding up. */
function StarMeter({ average }: { average: number }) {
  const pct = Math.max(0, Math.min(100, (average / 5) * 100));
  return (
    <div className="relative" role="img" aria-label={`${average.toFixed(1)} out of 5 stars`}>
      <div className="flex gap-1 text-border">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className="size-5 fill-current" />
        ))}
      </div>
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <div className="flex gap-1 text-brand-amber">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="size-5 fill-current" />
          ))}
        </div>
      </div>
    </div>
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
