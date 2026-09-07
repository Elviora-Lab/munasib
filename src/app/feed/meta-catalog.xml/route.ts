import { siteConfig } from '@/config/site';

import { prisma } from '@/lib/db';

// Regenerate at most hourly — Commerce Manager refetches on its own schedule.
export const revalidate = 3600;

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]!);

/** Meta accepts JPEG/PNG most reliably; WebP primaries are a common reject reason. */
function pickCatalogImage(urls: string[]): string | null {
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  if (!clean.length) return null;
  const preferred = clean.find((u) => !/\.webp(?:$|\?)/i.test(u));
  return preferred ?? clean[0]!;
}

function catalogDescription(name: string, short: string | null, full: string | null): string {
  const raw = (short || full || name).replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  // Meta flags tiny/garbage blurbs; fall back to the title when copy is truncated junk.
  const text = raw.length >= 30 ? raw : name;
  return text.slice(0, 4900);
}

/**
 * Meta Commerce Manager product catalog feed (RSS 2.0 + the g: namespace).
 *
 * Served at /feed/meta-catalog.xml. Add it in Commerce Manager as a scheduled
 * data feed to unlock Dynamic Product Ads / Advantage+ Catalog Ads.
 *
 * WHY THIS IS SEPARATE FROM THE GOOGLE MERCHANT FEED
 * Meta matches catalog items to pixel events by comparing `g:id` against the
 * `content_ids` we send. Our pixel sends `product.id` (see the `analytics`
 * facade and its call sites), whereas the Merchant Center feed keys on
 * `product.sku` because Google's own matching prefers a merchant SKU. Pointing
 * Commerce Manager at the Google feed would import the catalog but silently
 * match nothing — every retargeting and Advantage+ audience would come back
 * empty. So this feed deliberately keys on `product.id`.
 *
 * If `content_ids` ever changes, this `g:id` MUST change with it.
 */
export async function GET() {
  const products = await prisma.product
    .findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        fullDescription: true,
        price: true,
        comparePrice: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          select: { imageUrl: true },
        },
        variants: { where: { isActive: true }, select: { price: true, stockQuantity: true } },
      },
    })
    .catch(() => []);

  const items = products
    .map((p) => {
      const image = pickCatalogImage(p.images.map((i) => i.imageUrl));
      if (!image) return ''; // Meta requires an image_link.

      const link = `${siteConfig.url}/products/${p.slug}`;
      const variantPrices = p.variants.map((v) => Number(v.price)).filter((n) => n > 0);
      const price = variantPrices.length ? Math.min(...variantPrices) : Number(p.price);
      const compare = p.comparePrice ? Number(p.comparePrice) : 0;
      const inStock = p.variants.some((v) => v.stockQuantity > 0);
      const description = catalogDescription(p.name, p.shortDescription, p.fullDescription);
      const onSale = compare > price;

      // Meta shows `sale_price` struck through against `price`, so the higher
      // compare-at figure has to be `price` — same convention as the Google feed.
      const priceTags = onSale
        ? `<g:price>${compare.toFixed(2)} PKR</g:price><g:sale_price>${price.toFixed(2)} PKR</g:sale_price>`
        : `<g:price>${price.toFixed(2)} PKR</g:price>`;

      const additionalImages = p.images
        .map((i) => i.imageUrl.trim())
        .filter((url) => url && url !== image)
        .slice(0, 10)
        .map((url) => `<g:additional_image_link>${esc(url)}</g:additional_image_link>`)
        .join('');

      return `<item>
  <g:id>${esc(p.id)}</g:id>
  <title>${esc(p.name)}</title>
  <description>${esc(description)}</description>
  <link>${esc(link)}</link>
  <g:image_link>${esc(image)}</g:image_link>
  ${additionalImages}
  <g:availability>${inStock ? 'in stock' : 'out of stock'}</g:availability>
  ${priceTags}
  <g:brand>${esc(p.brand?.name || siteConfig.name)}</g:brand>
  <g:condition>new</g:condition>
  ${p.category?.name ? `<g:product_type>${esc(p.category.name)}</g:product_type>` : ''}
</item>`;
    })
    .filter(Boolean)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(siteConfig.name)}</title>
<link>${siteConfig.url}</link>
<description>${esc(siteConfig.description)}</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
