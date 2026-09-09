import 'server-only';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import {
  type CanonicalProductListSort,
  normalizeProductSort,
  type ProductListSort,
} from '@/lib/products/sort';

export type ProductListFilters = {
  category?: string; // slug
  brand?: string; // slug
  q?: string; // free-text
  priceMin?: number;
  priceMax?: number;
  // NOTE: no skinType filter — Product carries no skin-type data (only
  // skinConcerns). Add a relation before reintroducing it here.
  concern?: string; // skin-concern slug
  tag?: string; // tag slug
};

/**
 * Escape LIKE/ILIKE wildcards in user search input — Prisma's `contains`
 * passes `%`/`_` through, so an unescaped `%` would match the entire catalog.
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

const SORT_MAP: Record<CanonicalProductListSort, Prisma.ProductOrderByWithRelationInput[]> = {
  'newly-added': [{ createdAt: 'desc' }, { id: 'desc' }],
  'price-asc': [{ price: 'asc' }],
  'price-desc': [{ price: 'desc' }],
  // Merchandised bestsellers first, then proven sales, then browsing demand.
  // The old "popular" alias still lands here, but the visible feature is
  // intentionally "Best sellers", not "most viewed".
  'best-sellers': [
    { isFeatured: 'desc' },
    { orderItems: { _count: 'desc' } },
    { viewLogs: { _count: 'desc' } },
    { createdAt: 'desc' },
  ],
  // Review volume as the rating proxy — Prisma can't order by relation
  // average; switch to a materialized rating column if one lands.
  rating: [{ reviews: { _count: 'desc' } }, { createdAt: 'desc' }],
};

export const productsRepo = {
  async list(filters: ProductListFilters, sort: ProductListSort, skip: number, take: number) {
    const canonicalSort = normalizeProductSort(sort);
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      // Match against the full category membership (product_categories), not
      // just the primary categoryId — a product merchandised in several
      // categories must appear on each one's page.
      //
      // Match the category itself OR its direct parent, so a top-level page
      // (e.g. /categories/lips) rolls up products assigned to subcategories
      // (lipstick, liquid-lipstick). The taxonomy is one level deep.
      ...(filters.category
        ? {
            categories: {
              some: {
                category: {
                  OR: [{ slug: filters.category }, { parent: { slug: filters.category } }],
                },
              },
            },
          }
        : {}),
      ...(filters.brand ? { brand: { slug: filters.brand } } : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: escapeLike(filters.q), mode: 'insensitive' } },
              { shortDescription: { contains: escapeLike(filters.q), mode: 'insensitive' } },
            ],
          }
        : {}),
      // Price filters match the TRANSACTABLE price: a product qualifies when
      // at least one active variant falls in the range. Product.price is a
      // display/master price and can drift from what's actually chargeable.
      ...(filters.priceMin !== undefined || filters.priceMax !== undefined
        ? {
            variants: {
              some: {
                isActive: true,
                price: {
                  ...(filters.priceMin !== undefined ? { gte: filters.priceMin } : {}),
                  ...(filters.priceMax !== undefined ? { lte: filters.priceMax } : {}),
                },
              },
            },
          }
        : {}),
      ...(filters.concern
        ? { skinConcerns: { some: { skinConcern: { slug: filters.concern } } } }
        : {}),
      ...(filters.tag ? { tagMappings: { some: { tag: { slug: filters.tag } } } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: SORT_MAP[canonicalSort],
        skip,
        take,
        include: {
          images: { where: { isPrimary: true }, take: 1 },
          brand: { select: { name: true, slug: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  async findBySlug(slug: string) {
    return prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        brand: true,
        variants: { where: { isActive: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        skinConcerns: { include: { skinConcern: true } },
        ingredients: { include: { ingredient: true } },
        tagMappings: { include: { tag: true } },
      },
    });
  },

  /**
   * Lean lookup for the related-products path — the keys the relevance ranking
   * needs, without loading the seven relations `findBySlug` pulls.
   */
  async findRelatedSeed(slug: string) {
    return prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        price: true,
        categoryId: true,
        categories: { select: { categoryId: true } },
      },
    });
  },

  /**
   * Products genuinely related to `seed`, ranked rather than arbitrary.
   *
   * The previous implementation filtered on the primary `categoryId` and had NO
   * `ORDER BY`, so Postgres returned whatever the planner happened to yield —
   * the "Frequently bought together" rail on a vegetable chopper could be four
   * unrelated wall stickers. Ranking now runs on three signals, in order:
   *
   *  1. **Shared category count.** Uses the full `product_categories`
   *     membership, not just the primary category, so a product merchandised in
   *     both "Kitchen Accessories" and "Random Gadgets" scores highest against
   *     others sharing both.
   *  2. **Trigram name similarity.** `similarity()` from pg_trgm, backed by the
   *     existing GIN index on `products.name`, is what actually makes a chopper
   *     surface other choppers rather than other kitchen miscellany.
   *  3. **Price proximity.** Among equally related items, ones in the same price
   *     bracket are the plausible cross-sell.
   *
   * Falls back to the plain same-category query if the ranked one fails (e.g. a
   * database without pg_trgm), and tops up from the primary category when the
   * seed has too few category-mates to fill the rail.
   */
  async findRelated(
    seed: { id: string; name: string; price: unknown; categoryId: string | null },
    categoryIds: string[],
    limit: number,
  ) {
    const hydrate = async (ids: string[]) => {
      if (ids.length === 0) return [];
      const rows = await prisma.product.findMany({
        where: { id: { in: ids } },
        include: {
          images: { where: { isPrimary: true }, take: 1 },
          brand: { select: { name: true } },
        },
      });
      // `findMany` does not preserve the order of an `in` list — restore the
      // ranking, otherwise all of the work above is thrown away.
      const order = new Map(ids.map((id, i) => [id, i]));
      return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    };

    let rankedIds: string[] = [];
    if (categoryIds.length > 0) {
      try {
        const ranked = await prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM products p
          JOIN product_categories pc ON pc.product_id = p.id
          WHERE p.is_active
            AND p.id <> ${seed.id}::uuid
            AND pc.category_id = ANY(${categoryIds}::uuid[])
          GROUP BY p.id
          ORDER BY
            COUNT(DISTINCT pc.category_id) DESC,
            similarity(p.name, ${seed.name}) DESC,
            ABS(p.price - ${seed.price}::numeric) ASC
          LIMIT ${limit}
        `;
        rankedIds = ranked.map((r) => r.id);
      } catch {
        rankedIds = [];
      }
    }

    if (rankedIds.length >= limit) return hydrate(rankedIds.slice(0, limit));

    // Top up from the primary category (then anything active) so the rail is
    // never short — a seed in a small category still fills four slots.
    const fill = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: [seed.id, ...rankedIds] },
        ...(seed.categoryId ? { categoryId: seed.categoryId } : {}),
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: limit - rankedIds.length,
      select: { id: true },
    });

    return hydrate([...rankedIds, ...fill.map((f) => f.id)].slice(0, limit));
  },

  /** Active PDP slugs for ISR `generateStaticParams`. */
  async listActiveSlugs(): Promise<string[]> {
    const rows = await prisma.product.findMany({
      where: { isActive: true },
      select: { slug: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => r.slug);
  },
};
