import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { buildMetadata, generateProductMetadata } from '@/lib/seo/metadata';

import { ProductDetail } from './_components/product-detail';

import { getProductPageData } from '@/server/products/product-page-data';
import { productsService } from '@/server/services/products.service';

type Params = Promise<{ slug: string }>;

/**
 * Public PDP — shared Data Cache DTO for metadata + body.
 * Route ISR + `generateStaticParams` aim for CDN HITs; writes use `revalidateTag`.
 *
 * Stock/price shown here may be briefly stale; cart/checkout re-read authoritative
 * values and must never consume this DTO.
 */
export const revalidate = 900;

/** Prebuild active PDPs so the CDN can serve HIT without a cold Function. */
export async function generateStaticParams() {
  try {
    const slugs = await productsService.listActiveSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductPageData(slug);
  if (!data) {
    return buildMetadata({ title: 'Not found', path: `/products/${slug}`, noIndex: true });
  }
  const { product } = data;
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
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getProductPageData(slug);
  if (!data) notFound();

  return <ProductDetail slug={slug} data={data} />;
}
