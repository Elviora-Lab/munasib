import { publicEnv } from '@/config/env';

import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 3600; // Meta re-fetches the feed periodically.

/**
 * Meta / Facebook product catalog feed (CSV).
 *
 * Point a Data Feed at `/api/catalog` in Commerce Manager. Each row's `id`
 * equals the product id the pixel sends as `content_ids`, so ViewContent /
 * AddToCart / Purchase events tie back to catalog items — enabling dynamic
 * (Advantage+ catalog) retargeting ads.
 */

const HEADERS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
] as const;

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  const brandName = publicEnv.NEXT_PUBLIC_SITE_NAME || 'Kitchenly';

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      fullDescription: true,
      price: true,
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        select: { imageUrl: true },
      },
      brand: { select: { name: true } },
      variants: { select: { stockQuantity: true, isActive: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = products
    .map((p) => {
      const urls = p.images.map((i) => i.imageUrl.trim()).filter(Boolean);
      const image = urls.find((u) => !/\.webp(?:$|\?)/i.test(u)) ?? urls[0];
      if (!image) return null; // Meta requires an image_link.
      const inStock = p.variants.some((v) => v.isActive && v.stockQuantity > 0);
      const raw = (p.shortDescription || p.fullDescription || p.name)
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
      const description = raw.length >= 30 ? raw : p.name;
      return [
        csvCell(p.id),
        csvCell(p.name),
        csvCell(description),
        csvCell(inStock ? 'in stock' : 'out of stock'),
        csvCell('new'),
        csvCell(`${Number(p.price).toFixed(2)} PKR`),
        csvCell(`${siteUrl}/products/${p.slug}`),
        csvCell(image),
        csvCell(p.brand?.name || brandName),
      ].join(',');
    })
    .filter((row): row is string => row !== null);

  const csv = [HEADERS.join(','), ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
