import 'server-only';

import { unstable_cache } from 'next/cache';

import type { ProductCardData } from '@/design-system/patterns/product-card';

import { cacheTags } from '@/server/cache/tags';
import { productsRepo } from '@/server/repositories/products.repo';
import { reviewsRepo } from '@/server/repositories/reviews.repo';
import { toProductCard } from '@/server/services/_mappers/product.mapper';
import { flashSaleService } from '@/server/services/flash-sale.service';

/**
 * Serializable public PDP payload.
 * Shared by `generateMetadata` + page render so we do not double-query Prisma.
 *
 * Cached in the Next.js Data Cache (tagged). This is NOT the same as Cache
 * Components (`'use cache'`): enabling `cacheComponents` requires an app-wide
 * migration (remove `revalidate`/`dynamic`/`runtime`, fix `new Date()`, wrap
 * `cookies()` in Suspense). Until then, Data Cache + route ISR is the workable
 * path for this codebase.
 */
export type ProductPageData = {
  product: {
    id: string;
    slug: string;
    name: string;
    sku: string;
    isActive: boolean;
    shortDescription: string | null;
    fullDescription: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    price: number;
    comparePrice: number | null;
    category: { id: string; name: string; slug: string } | null;
    brand: { id: string; name: string; slug: string } | null;
    images: Array<{
      imageUrl: string;
      altText: string | null;
      variantId: string | null;
    }>;
    variants: Array<{
      id: string;
      sku: string;
      size: string | null;
      shade: string | null;
      fragrance: string | null;
      price: number;
      stockQuantity: number;
      isActive: boolean;
    }>;
    skinConcerns: Array<{ id: string; name: string }>;
    ingredients: Array<{ id: string; name: string; description: string | null }>;
  };
  related: ProductCardData[];
  reviewSummary: { average: number; count: number };
  reviews: Array<{
    id: string;
    rating: number;
    title: string | null;
    comment: string | null;
    isVerifiedPurchase: boolean;
    createdAt: string;
    authorName: string | null;
    user: { firstName: string | null; lastName: string | null } | null;
    images: Array<{ id: string; imageUrl: string }>;
  }>;
  /** Display-only — checkout re-reads flash discounts authoritatively. */
  flashSale: {
    title: string;
    endsAt: string;
    discountPercent: number;
  } | null;
};

/** Align with public PDP ISR (`revalidate = 86400`); writes still bust via tags. */
const PDP_REVALIDATE_SECONDS = 86400;

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v && typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v ?? 0);
}

async function loadProductPageDataFromDb(
  slug: string,
  opts: { allowInactive: boolean },
): Promise<ProductPageData | null> {
  const row = await productsRepo.findBySlug(slug);
  if (!row) return null;
  if (!row.isActive && !opts.allowInactive) return null;

  const [relatedRows, summary, reviewRows, flashSummary] = await Promise.all([
    (async () => {
      const seed = await productsRepo.findRelatedSeed(slug);
      if (!seed) return [];
      const categoryIds = seed.categories.map((c) => c.categoryId);
      const related = await productsRepo.findRelated(seed, categoryIds, 4);
      return related.map(toProductCard);
    })(),
    reviewsRepo.summary(row.id),
    reviewsRepo.listApproved(row.id, 10),
    flashSaleService.liveSummary().catch(() => null),
  ]);

  const flashPercent = flashSummary?.discounts[row.id];
  const flashSale =
    flashPercent !== undefined && flashSummary
      ? {
          title: flashSummary.title,
          endsAt: flashSummary.endsAt,
          discountPercent: flashPercent,
        }
      : null;

  return {
    product: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      isActive: row.isActive,
      shortDescription: row.shortDescription,
      fullDescription: row.fullDescription,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      price: toNum(row.price),
      comparePrice: row.comparePrice != null ? toNum(row.comparePrice) : null,
      category: row.category
        ? { id: row.category.id, name: row.category.name, slug: row.category.slug }
        : null,
      brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug } : null,
      images: row.images.map((img) => ({
        imageUrl: img.imageUrl,
        altText: img.altText,
        variantId: img.variantId,
      })),
      variants: row.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        size: v.size,
        shade: v.shade,
        fragrance: v.fragrance,
        price: toNum(v.price),
        stockQuantity: v.stockQuantity,
        isActive: v.isActive,
      })),
      skinConcerns: row.skinConcerns.map((pc) => ({
        id: pc.skinConcern.id,
        name: pc.skinConcern.name,
      })),
      ingredients: row.ingredients.map((pi) => ({
        id: pi.ingredient.id,
        name: pi.ingredient.name,
        description: pi.ingredient.description,
      })),
    },
    related: relatedRows,
    reviewSummary: { average: summary.average, count: summary.count },
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      isVerifiedPurchase: r.isVerifiedPurchase,
      createdAt: r.createdAt.toISOString(),
      authorName: r.authorName,
      user: r.user ? { firstName: r.user.firstName, lastName: r.user.lastName } : null,
      images: r.images.map((i) => ({ id: i.id, imageUrl: i.imageUrl })),
    })),
    flashSale,
  };
}

/**
 * Public PDP data — one tagged Data Cache entry per slug.
 * Invalidated via `productsService.invalidate(slug)` / flash-sale admin writes.
 */
export function getProductPageData(slug: string): Promise<ProductPageData | null> {
  return unstable_cache(
    () => loadProductPageDataFromDb(slug, { allowInactive: false }),
    ['product-page-data', slug],
    {
      revalidate: PDP_REVALIDATE_SECONDS,
      tags: [cacheTags.product(slug), cacheTags.flashSale],
    },
  )();
}

/** Admin preview — never cached; may include inactive products. */
export function getProductPageDataFresh(
  slug: string,
  opts: { allowInactive?: boolean } = {},
): Promise<ProductPageData | null> {
  return loadProductPageDataFromDb(slug, { allowInactive: Boolean(opts.allowInactive) });
}
