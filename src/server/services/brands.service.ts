import 'server-only';

import { revalidateTag, unstable_cache } from 'next/cache';

import { brandsRepo } from '@/server/repositories/brands.repo';

const BRANDS_TAG = 'brands';
const BRAND_REVALIDATE_SECONDS = 3600;

export const brandsService = {
  /** Active brands (with product counts) — small and stable. */
  list() {
    return unstable_cache(() => brandsRepo.listActive(), ['brands-active'], {
      revalidate: BRAND_REVALIDATE_SECONDS,
      tags: [BRANDS_TAG],
    })();
  },

  getBySlug(slug: string) {
    return unstable_cache(() => brandsRepo.findBySlug(slug), ['brand-by-slug', slug], {
      revalidate: BRAND_REVALIDATE_SECONDS,
      tags: [`brand:${slug}`, BRANDS_TAG],
    })();
  },

  invalidate(slug?: string) {
    if (slug) revalidateTag(`brand:${slug}`, 'max');
    revalidateTag(BRANDS_TAG, 'max');
  },
};
