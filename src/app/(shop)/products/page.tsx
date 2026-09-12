import type { Metadata } from 'next';

import {
  normalizeProductSort,
  PRODUCT_SORT_VALUES,
  type ProductListSort,
} from '@/lib/products/sort';
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { buildMetadata } from '@/lib/seo/metadata';

import { Section } from '@/design-system/primitives/section';

import { InfiniteProducts } from '@/features/products/components/infinite-products';
import { ProductFilters } from '@/features/products/components/product-filters';

import { CatalogPagination } from '../_components/catalog-pagination';

import { brandsService } from '@/server/services/brands.service';
import { productsService } from '@/server/services/products.service';

const LIST_DESCRIPTION =
  'Shop the full Munasib range online in Pakistan — kitchen accessories, home and living, organizers, gadgets, beauty, baby and decor. Cash on delivery nationwide.';

/** Fallback TTL; filtered URLs stay dynamic via searchParams, Data Cache still helps. */
export const revalidate = 600;

/**
 * Per-page canonical. Page 2+ points at itself rather than collapsing onto
 * page 1, so Google keeps crawling deeper listings instead of treating them as
 * duplicates of the first page. Sort/brand params are deliberately excluded —
 * those variants SHOULD still fold onto the clean URL.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const base = 'All Products — Home, Kitchen & Everyday Essentials in Pakistan';
  return buildMetadata({
    title: page > 1 ? `${base} — Page ${page}` : base,
    description: LIST_DESCRIPTION,
    path: page > 1 ? `/products?page=${page}` : '/products',
  });
}

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const PAGE_SIZE = 24;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sortParam = str(sp.sort);
  const sort: ProductListSort = PRODUCT_SORT_VALUES.includes(sortParam as ProductListSort)
    ? normalizeProductSort(sortParam)
    : 'newly-added';
  const page = Math.max(1, Number(str(sp.page)) || 1);

  // Same failure posture as the homepage: a catalog-service hiccup renders an
  // empty listing, not a 500.
  const [{ items, total }, brands] = await Promise.all([
    productsService
      .list({ q: str(sp.q), brand: str(sp.brand) }, sort, page, PAGE_SIZE)
      .catch(() => ({ items: [], total: 0 })),
    brandsService.list().catch(() => []),
  ]);

  return (
    <Section>
      <div className="container flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="eyebrow">Catalog</span>
          <h1 className="editorial-heading text-display-lg">All products</h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Everything Munasib stocks, in one place — kitchen tools and storage, home and cleaning
            essentials, wardrobe organizers, gadgets, beauty, baby and decor. Delivered anywhere in
            Pakistan with cash on delivery.
          </p>
        </header>
        <ProductFilters brands={brands.map((b) => ({ name: b.name, slug: b.slug }))} />
        <InfiniteProducts
          // Remount on filter/sort change so results never append onto a stale list.
          key={`${str(sp.q) ?? ''}|${str(sp.brand) ?? ''}|${sort}`}
          initialProducts={items}
          total={total}
          pageSize={PAGE_SIZE}
          query={{ q: str(sp.q), brand: str(sp.brand), sort }}
          listId="catalog"
          listName="All products"
        />
        {/* Always rendered, not wrapped in <noscript>. Infinite scroll can't run
            for a crawler, and with 579 products the sitemap was the only thing
            pointing at anything past the first 24 — no internal links, so no
            link equity reaching deep products. */}
        <CatalogPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/products"
          params={{ q: str(sp.q), brand: str(sp.brand), sort: str(sp.sort) }}
          showSummary={false}
          label="Browse the full catalog"
        />

        <JsonLd
          data={breadcrumbJsonLd([
            { label: 'Home', href: '/' },
            { label: 'Products', href: '/products' },
          ])}
        />
        {items.length > 0 ? (
          <JsonLd
            data={itemListJsonLd(
              items.map((p) => ({ name: p.name, slug: p.slug })),
              { path: '/products' },
            )}
          />
        ) : null}
      </div>
    </Section>
  );
}
