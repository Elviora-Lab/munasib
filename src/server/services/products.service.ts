import 'server-only';

import { revalidateTag, unstable_cache } from 'next/cache';

import { type ProductListSort } from '@/lib/products/sort';

import { toProductCard } from './_mappers/product.mapper';

import { cacheTags } from '@/server/cache/tags';
import { events } from '@/server/events';
import { NotFoundError } from '@/server/http/errors';
import { type ProductListFilters, productsRepo } from '@/server/repositories/products.repo';
import { reviewsRepo } from '@/server/repositories/reviews.repo';

/** Route / Data Cache TTL — writes invalidate via tags, so this can be long. */
const DETAIL_REVALIDATE_SECONDS = 3600;
const LIST_REVALIDATE_SECONDS = 600;
const REVIEWS_REVALIDATE_SECONDS = 600;

function cachedProductBySlug(slug: string) {
  return unstable_cache(() => productsRepo.findBySlug(slug), ['product-by-slug', slug], {
    revalidate: DETAIL_REVALIDATE_SECONDS,
    tags: [cacheTags.product(slug)],
  })();
}

function cachedRelated(slug: string, limit: number) {
  return unstable_cache(
    async () => {
      const root = await productsRepo.findRelatedSeed(slug);
      if (!root) return null;
      const categoryIds = root.categories.map((c) => c.categoryId);
      const related = await productsRepo.findRelated(root, categoryIds, limit);
      return related.map(toProductCard);
    },
    ['product-related', slug, String(limit)],
    {
      revalidate: DETAIL_REVALIDATE_SECONDS,
      tags: [cacheTags.product(slug)],
    },
  )();
}

function cachedProductList(
  filters: ProductListFilters,
  sort: ProductListSort,
  page: number,
  pageSize: number,
) {
  return unstable_cache(
    async () => {
      const skip = (page - 1) * pageSize;
      const { items, total } = await productsRepo.list(filters, sort, skip, pageSize);
      return { items: items.map(toProductCard), total };
    },
    ['product-list', sort, String(page), String(pageSize), JSON.stringify(filters)],
    {
      revalidate: LIST_REVALIDATE_SECONDS,
      tags: [cacheTags.productsList],
    },
  )();
}

function cachedProductReviews(productId: string, slug: string) {
  return unstable_cache(
    async () => {
      const [summary, reviews] = await Promise.all([
        reviewsRepo.summary(productId),
        reviewsRepo.listApproved(productId, 10),
      ]);
      return { summary, reviews };
    },
    ['product-reviews', productId],
    {
      revalidate: REVIEWS_REVALIDATE_SECONDS,
      tags: [cacheTags.productReviews(productId), cacheTags.product(slug)],
    },
  )();
}

export const productsService = {
  /**
   * Returns products in the `ProductCardData` shape — already projected so
   * the client doesn't have to know about Prisma's row layout (`images[]`,
   * `Decimal`, etc.). `imageUrl` is guaranteed to be a string.
   *
   * Cached in Next.js Data Cache (tagged) so ISR rebuilds and dynamic catalog
   * routes avoid re-hitting Prisma on every Function invocation.
   */
  list(filters: ProductListFilters, sort: ProductListSort, page: number, pageSize: number) {
    return cachedProductList(filters, sort, page, pageSize);
  },

  async getBySlug(
    slug: string,
    viewer: { userId?: string | null; track?: boolean; allowInactive?: boolean } = {},
  ) {
    const product = await cachedProductBySlug(slug);
    if (!product) throw new NotFoundError('Product not found');

    // Hidden (isActive=false) products are not publicly reachable — treat them
    // as not-found for the storefront. Admin preview passes `allowInactive`.
    if (!product.isActive && !viewer.allowInactive) throw new NotFoundError('Product not found');

    // Count a view only for the actual page render — `generateMetadata` also
    // calls this and passes `track: false` to avoid double-counting.
    if (viewer.track !== false) {
      events.emit('product.viewed', { productId: product.id, userId: viewer.userId ?? null });
    }

    return product;
  },

  async getRelated(slug: string, limit = 4) {
    const cards = await cachedRelated(slug, limit);
    if (!cards) throw new NotFoundError('Product not found');
    return cards;
  },

  /** Approved reviews + summary for a PDP — tagged with the product for joint invalidation. */
  getReviews(productId: string, slug: string) {
    return cachedProductReviews(productId, slug);
  },

  /** Active storefront slugs — used by `generateStaticParams` for the PDP. */
  listActiveSlugs() {
    return unstable_cache(() => productsRepo.listActiveSlugs(), ['product-active-slugs'], {
      revalidate: DETAIL_REVALIDATE_SECONDS,
      tags: [cacheTags.productsList],
    })();
  },

  /**
   * Drop Next Data Cache entries for one product + all product lists.
   * Called by every admin product mutation.
   */
  invalidate(slug: string) {
    revalidateTag(cacheTags.product(slug), 'max');
    this.invalidateLists();
  },

  /**
   * Invalidate every cached product list. Does NOT bust per-product detail
   * caches — those are tagged with `product:{slug}` only.
   */
  invalidateLists() {
    revalidateTag(cacheTags.productsList, 'max');
  },

  invalidateReviews(productId: string, slug?: string) {
    revalidateTag(cacheTags.productReviews(productId), 'max');
    if (slug) revalidateTag(cacheTags.product(slug), 'max');
  },
};
