import 'server-only';

import { revalidateTag, unstable_cache } from 'next/cache';

import { cacheTags } from '@/server/cache/tags';
import { categoriesRepo } from '@/server/repositories/categories.repo';

const CATEGORY_REVALIDATE_SECONDS = 3600;

export const categoriesService = {
  list() {
    return unstable_cache(() => categoriesRepo.listActive(), ['categories-active'], {
      revalidate: CATEGORY_REVALIDATE_SECONDS,
      tags: [cacheTags.categories],
    })();
  },

  /** Top-level categories with subcategories nested (nav / API shape). */
  tree() {
    return unstable_cache(() => categoriesRepo.listTree(), ['categories-tree'], {
      revalidate: CATEGORY_REVALIDATE_SECONDS,
      tags: [cacheTags.categories],
    })();
  },

  /** One category with its children, parent, and siblings (via parent). */
  getBySlug(slug: string) {
    return unstable_cache(() => categoriesRepo.findBySlug(slug), ['category-by-slug', slug], {
      revalidate: CATEGORY_REVALIDATE_SECONDS,
      tags: [cacheTags.category(slug), cacheTags.categories],
    })();
  },

  invalidate(slug?: string) {
    if (slug) revalidateTag(cacheTags.category(slug), 'max');
    revalidateTag(cacheTags.categories, 'max');
  },
};
