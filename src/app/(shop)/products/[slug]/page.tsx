import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { buildMetadata, generateProductMetadata } from '@/lib/seo/metadata';

import { ProductDetail } from './_components/product-detail';

import { productsService } from '@/server/services/products.service';

type Params = Promise<{ slug: string }>;

// ISR + tagged Data Cache. Writes call revalidateTag(`product:${slug}`), so
// this can stay long without serving stale admin edits for an hour.
export const revalidate = 3600;

/** Prebuild active PDPs so the CDN serves HIT instead of cold Function misses. */
export async function generateStaticParams() {
  try {
    const slugs = await productsService.listActiveSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    // Build without DB (or transient outage) — fall back to on-demand ISR.
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    // Metadata pass — don't count this as a product view.
    const product = await productsService.getBySlug(slug, { track: false });
    // Titles and descriptions are composed by the shared factory rather than
    // read straight off the row: ~200 imported products carry truncated
    // supplier copy ("Take a look at…", some as short as six characters) in
    // `seo_description`, which was being served verbatim as the meta
    // description and as the Product schema `description`.
    return generateProductMetadata({
      name: product.name,
      slug,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      shortDescription: product.shortDescription,
      fullDescription: product.fullDescription,
      categoryName: product.category?.name,
      image: product.images[0]?.imageUrl,
    });
  } catch {
    return buildMetadata({ title: 'Not found', path: `/products/${slug}`, noIndex: true });
  }
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  let product;
  try {
    // No view emit here — keeps the render cacheable; the beacon logs the view.
    // Hidden products throw here → notFound() (not publicly reachable).
    product = await productsService.getBySlug(slug, { track: false });
  } catch {
    notFound();
  }

  return <ProductDetail slug={slug} product={product} />;
}
