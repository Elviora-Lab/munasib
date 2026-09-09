import 'server-only';

/**
 * Next.js Data Cache tags for storefront reads.
 * Pair with `unstable_cache({ tags })` and `revalidateTag(tag, 'max')` on writes.
 */
export const cacheTags = {
  productsList: 'products:list',
  product: (slug: string) => `product:${slug}`,
  productReviews: (productId: string) => `product-reviews:${productId}`,
  categories: 'categories',
  category: (slug: string) => `category:${slug}`,
  /** Site-wide flash-sale display summary (short TTL). */
  flashSale: 'flash-sale',
} as const;
