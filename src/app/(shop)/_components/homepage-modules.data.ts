import 'server-only';

import { prisma } from '@/lib/db';

import { variantCode, variantHex } from '@/app/admin/products/_lib/shade';
import { reviewsRepo } from '@/server/repositories/reviews.repo';

export type SpotlightShade = {
  id: string;
  name: string;
  hex: string;
  imageUrl: string;
  price: number;
};

export type ShadeSpotlight = {
  name: string;
  slug: string;
  shades: SpotlightShade[];
} | null;

/**
 * The most shade-rich product in the catalog, distilled to a swatch set for the
 * interactive "Shop the shades" spotlight. Only variants that carry both a real
 * hex (encoded in the shade label) and their own image qualify, deduped by
 * colour and capped so the swatch row stays elegant. Returns null when no
 * product has enough colour variants — the section then simply doesn't render.
 */
export async function getShadeSpotlight(): Promise<ShadeSpotlight> {
  const product = await prisma.product.findFirst({
    where: {
      isActive: true,
      variants: { some: { isActive: true, shade: { contains: '@#' }, images: { some: {} } } },
    },
    orderBy: { variants: { _count: 'desc' } },
    select: {
      name: true,
      slug: true,
      variants: {
        where: { isActive: true, shade: { contains: '@#' }, images: { some: {} } },
        orderBy: { stockQuantity: 'desc' },
        take: 48,
        select: {
          id: true,
          shade: true,
          price: true,
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            select: { imageUrl: true },
          },
        },
      },
    },
  });

  if (!product) return null;

  const seen = new Set<string>();
  const shades: SpotlightShade[] = [];
  for (const v of product.variants) {
    if (!v.shade) continue;
    const hex = variantHex(v.shade);
    const imageUrl = v.images[0]?.imageUrl;
    if (!hex || !imageUrl) continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    shades.push({
      id: v.id,
      name: variantCode(v.shade) || 'Shade',
      hex,
      imageUrl,
      price: Number(v.price),
    });
    if (shades.length >= 14) break;
  }

  if (shades.length < 4) return null;
  return { name: product.name, slug: product.slug, shades };
}

export type ShowcaseReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  verified: boolean;
  author: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
};

/** Recent approved reviews mapped to plain, client-safe objects. */
export async function getShowcaseReviews(take = 12): Promise<ShowcaseReview[]> {
  const rows = await reviewsRepo.recentApproved(take);
  return rows
    .filter((r) => r.comment && r.comment.trim().length > 0)
    .map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment as string,
      verified: r.isVerifiedPurchase,
      author: r.user?.firstName?.trim() || r.authorName?.trim() || 'Munasib customer',
      productName: r.product.name,
      productSlug: r.product.slug,
      productImage: r.product.images[0]?.imageUrl ?? null,
    }));
}
