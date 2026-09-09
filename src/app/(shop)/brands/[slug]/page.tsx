import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import {
  normalizeProductSort,
  PRODUCT_SORT_VALUES,
  type ProductListSort,
} from '@/lib/products/sort';
import { breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { buildMetadata } from '@/lib/seo/metadata';

import { Breadcrumb } from '@/design-system/primitives/breadcrumb';
import { Section } from '@/design-system/primitives/section';

import { InfiniteProducts } from '@/features/products/components/infinite-products';
import { ProductFilters } from '@/features/products/components/product-filters';

import { CatalogPagination } from '../../_components/catalog-pagination';

import { brandsService } from '@/server/services/brands.service';
import { productsService } from '@/server/services/products.service';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const PAGE_SIZE = 24;

export const revalidate = 600;

export async function generateStaticParams() {
  try {
    const brands = await brandsService.list();
    return brands.filter((b) => b.isActive).map((b) => ({ slug: b.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [brand, brands] = await Promise.all([
    brandsService.getBySlug(slug),
    brandsService.list().catch(() => []),
  ]);
  if (!brand || !brand.isActive) {
    return buildMetadata({ title: 'Brand not found', path: `/brands/${slug}`, noIndex: true });
  }
  return buildMetadata({
    title: `${brand.name} Products Online in Pakistan`,
    description:
      brand.description ??
      `Shop the full ${brand.name} range online in Pakistan — home, kitchen and everyday essentials with cash on delivery nationwide.`,
    path: `/brands/${slug}`,
    image: brand.logo ?? undefined,
    // The whole catalog currently sits under a single own-label brand, so this
    // page is a byte-for-byte duplicate of /products competing with it for the
    // same queries. Keep it crawlable (`follow` — it links to every product)
    // but out of the index until a second brand exists, at which point brand
    // pages become genuinely distinct and this lifts itself automatically.
    noIndex: brands.filter((b) => b.isActive).length < 2,
  });
}

export default async function BrandPage({
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

  // The product list is keyed by slug, not by the brand row — start both
  // queries together instead of serializing them.
  const [brand, { items, total }] = await Promise.all([
    brandsService.getBySlug(slug),
    productsService.list({ brand: slug }, sort, page, PAGE_SIZE),
  ]);
  if (!brand || !brand.isActive) notFound();

  return (
    <Section>
      <div className="container flex flex-col gap-6 sm:gap-8">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: brand.name }]} />
        <header className="flex items-start gap-5">
          {brand.logo ? (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:size-20">
              <Image src={brand.logo} alt={brand.name} fill className="object-contain p-2" />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Brand</span>
            <h1 className="editorial-heading text-display-lg">{brand.name}</h1>
            {brand.description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {brand.description}
              </p>
            ) : null}
          </div>
        </header>

        <ProductFilters />
        <InfiniteProducts
          key={`${slug}|${sort}`}
          initialProducts={items}
          total={total}
          pageSize={PAGE_SIZE}
          query={{ brand: slug, sort }}
          listId={`brand_${slug}`}
          listName={brand.name}
        />
        <noscript>
          <CatalogPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath={`/brands/${slug}`}
            params={{ sort: str(sp.sort) }}
          />
        </noscript>

        <JsonLd
          data={breadcrumbJsonLd([
            { label: 'Home', href: '/' },
            { label: brand.name, href: `/brands/${slug}` },
          ])}
        />
      </div>
    </Section>
  );
}
