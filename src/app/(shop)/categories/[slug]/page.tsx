import type { Metadata } from 'next';

import { categorySeo, MIN_INDEXABLE_PRODUCTS } from '@/config/category-seo';
import { routes } from '@/config/routes';

import {
  normalizeProductSort,
  PRODUCT_SORT_VALUES,
  type ProductListSort,
} from '@/lib/products/sort';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { buildMetadata, generateCategoryMetadata } from '@/lib/seo/metadata';

import { Breadcrumb } from '@/design-system/primitives/breadcrumb';
import { Section } from '@/design-system/primitives/section';
import { CategoryViewTracker } from '@/components/analytics/pixel-trackers';

import { CategorySeoBlock } from '@/features/categories/components/category-seo-block';
import {
  type SubcategoryChip,
  SubcategoryNav,
} from '@/features/categories/components/subcategory-nav';
import { InfiniteProducts } from '@/features/products/components/infinite-products';
import { ProductFilters } from '@/features/products/components/product-filters';

import { CatalogPagination } from '../../_components/catalog-pagination';

import { blogRepo } from '@/server/repositories/blog.repo';
import { brandsService } from '@/server/services/brands.service';
import { categoriesService } from '@/server/services/categories.service';
import { productsService } from '@/server/services/products.service';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const PAGE_SIZE = 24;

/** Fallback TTL; query/sort variants are dynamic, Data Cache still covers Prisma. */
export const revalidate = 600;

/** Prebuild default category URLs (no query string) for CDN HITs. */
export async function generateStaticParams() {
  try {
    const categories = await categoriesService.list();
    return categories.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

function prettify(slug: string) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const [category, listing] = await Promise.all([
    categoriesService.getBySlug(slug).catch(() => null),
    // Only the total is needed here, so ask for a single row.
    productsService
      .list({ category: slug }, 'newly-added', 1, 1)
      .catch(() => ({ items: [], total: 0 })),
  ]);
  const name = category?.name ?? prettify(slug);
  const seo = categorySeo(slug);
  // Self-referencing canonical per page; sort/brand variants still fold onto
  // the clean category URL.
  const page = Math.max(1, Number(str(sp.page)) || 1);

  const meta = generateCategoryMetadata({
    slug,
    name,
    seoTitle: seo?.title,
    seoDescription: seo?.description,
    description: category?.description,
    page,
  });

  // A category too thin to deserve a ranking stays live and linked but is kept
  // out of the index (and out of the sitemap) until it has real inventory —
  // asking Google to rank a three-product page trains it to distrust the rest.
  if (listing.total < MIN_INDEXABLE_PRODUCTS) {
    return { ...meta, robots: buildMetadata({ noIndex: true }).robots };
  }
  return meta;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const sortParam = str(sp.sort);
  const sort: ProductListSort = PRODUCT_SORT_VALUES.includes(sortParam as ProductListSort)
    ? normalizeProductSort(sortParam)
    : 'newly-added';
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const seo = categorySeo(slug);

  // The category row drives the display name, description, and subcategory
  // chips; unknown slugs still render a (likely empty) product listing.
  const [category, { items, total }, brands, allCategories, guides] = await Promise.all([
    categoriesService.getBySlug(slug).catch(() => null),
    productsService
      .list({ category: slug, brand: str(sp.brand) }, sort, page, PAGE_SIZE)
      .catch(() => ({ items: [], total: 0 })),
    brandsService.list().catch(() => []),
    categoriesService.list().catch(() => []),
    blogRepo.listBySlugs(seo?.guides ?? []).catch(() => []),
  ]);

  const name = category?.name ?? prettify(slug);
  const heading = seo?.h1 ?? name;
  const lead = seo?.lead ?? category?.description ?? null;
  const parent = category?.parent ?? null;
  const children = category?.children ?? [];
  const siblings = parent?.children ?? [];

  // Sideways links, resolved against the live category list so a slug removed
  // from the DB silently drops out instead of rendering a dead link.
  const relatedCategories = (seo?.related ?? [])
    .map((s) => allCategories.find((c) => c.slug === s))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({ name: c.name, slug: c.slug }));

  // Parent page → chips for its subcategories ("All" = the page itself).
  // Subcategory page → chips for its siblings, current one highlighted.
  const chips: SubcategoryChip[] = children.length
    ? [
        { label: `All ${name}`, href: routes.category(slug), active: true },
        ...children.map((c) => ({ label: c.name, href: routes.category(c.slug) })),
      ]
    : parent
      ? [
          { label: `All ${parent.name}`, href: routes.category(parent.slug) },
          ...siblings.map((c) => ({
            label: c.name,
            href: routes.category(c.slug),
            active: c.slug === slug,
          })),
        ]
      : [];

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Categories', href: '/categories' },
    ...(parent ? [{ label: parent.name, href: routes.category(parent.slug) }] : []),
    { label: name },
  ];

  return (
    <Section>
      <CategoryViewTracker slug={slug} name={name} />
      <div className="container flex flex-col gap-6 sm:gap-8">
        <Breadcrumb items={crumbs} />
        <header className="flex flex-col gap-2">
          <span className="eyebrow">{parent ? parent.name : 'Category'}</span>
          <h1 className="editorial-heading text-display-lg">{heading}</h1>
          {lead ? (
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {lead}
            </p>
          ) : null}
        </header>

        <SubcategoryNav chips={chips} />

        <ProductFilters brands={brands.map((b) => ({ name: b.name, slug: b.slug }))} />
        <InfiniteProducts
          key={`${slug}|${str(sp.brand) ?? ''}|${sort}`}
          initialProducts={items}
          total={total}
          pageSize={PAGE_SIZE}
          query={{ category: slug, brand: str(sp.brand), sort }}
          listId={`category_${slug}`}
          listName={name}
        />
        {/* Rendered for everyone, not just inside <noscript>. Infinite scroll is
            the shopper's path through a long listing, but a crawler never
            scrolls — these real hrefs are how pages 2..n of a 197-product
            category get discovered and how link equity reaches deep products. */}
        <CatalogPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath={routes.category(slug)}
          params={{ brand: str(sp.brand), sort: str(sp.sort) }}
          showSummary={false}
          label={`All ${name.toLowerCase()}`}
        />

        {seo ? (
          <CategorySeoBlock seo={seo} relatedCategories={relatedCategories} guides={guides} />
        ) : null}

        <JsonLd
          data={breadcrumbJsonLd([
            { label: 'Home', href: '/' },
            { label: 'Categories', href: '/categories' },
            ...(parent ? [{ label: parent.name, href: routes.category(parent.slug) }] : []),
            { label: name, href: `/categories/${slug}` },
          ])}
        />
        <JsonLd
          data={collectionPageJsonLd({
            name: heading,
            description: seo?.description ?? category?.description ?? '',
            path: `/categories/${slug}`,
            items: items.map((p) => ({ name: p.name, slug: p.slug })),
          })}
        />
      </div>
    </Section>
  );
}
