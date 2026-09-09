import { flashPrice } from '@/lib/flash-sale';
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { stripSupplierBoilerplate } from '@/lib/seo/metadata';

import { ProductCard } from '@/design-system/patterns/product-card';
import { Breadcrumb } from '@/design-system/primitives/breadcrumb';
import { Section } from '@/design-system/primitives/section';
import { FreeDeliveryBanner } from '@/components/commerce/free-delivery-banner';

import { RecentlyViewed } from '@/features/recommendations/components/recently-viewed';
import { RecentlyViewedTracker } from '@/features/recommendations/components/recently-viewed-tracker';

import { ProductExperience } from './product-experience';
import { ProductReviews } from './product-reviews';
import { ProductViewBeacon } from './product-view-beacon';

import type { ProductPageData } from '@/server/products/product-page-data';

/**
 * Presentational PDP — all Prisma/enrichment is loaded by `getProductPageData`
 * (Data Cache) or `getProductPageDataFresh` (admin preview). No DB calls here.
 */
export function ProductDetail({
  slug,
  data,
  trackView = true,
}: {
  slug: string;
  data: ProductPageData;
  trackView?: boolean;
}) {
  const { product, related, reviewSummary, reviews, flashSale } = data;

  const primaryImage = product.images[0]?.imageUrl;
  const galleryImages = product.images.map((img) => ({
    url: img.imageUrl,
    alt: img.altText ?? product.name,
    variantId: img.variantId,
  }));

  const variantOptions = product.variants.map((v) => {
    const label = [v.size, v.shade, v.fragrance].filter(Boolean).join(' · ') || v.sku;
    const hexMatch = label.match(/@#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    const name = label
      .replace(/\s*@#?[0-9a-fA-F]{3,8}\b/i, '')
      .replace(/[·\s]+$/, '')
      .trim();
    const listPrice = v.price;
    return {
      id: v.id,
      name: name || v.sku,
      hex: hexMatch ? `#${hexMatch[1]}` : undefined,
      price: flashSale ? flashPrice(listPrice, flashSale.discountPercent) : listPrice,
      originalPrice: flashSale ? listPrice : undefined,
      stockQuantity: v.stockQuantity,
      isActive: v.isActive,
    };
  });

  const startingPrice = variantOptions.length ? Math.min(...variantOptions.map((v) => v.price)) : 0;
  const totalStock = product.variants.reduce((sum, v) => sum + v.stockQuantity, 0);

  const crumbTrail = product.category
    ? [
        { label: 'Home', href: '/' },
        { label: product.category.name, href: `/categories/${product.category.slug}` },
      ]
    : [
        { label: 'Home', href: '/' },
        { label: 'All products', href: '/products' },
      ];

  return (
    <Section>
      <div className="container flex flex-col gap-10">
        {trackView ? <ProductViewBeacon slug={slug} /> : null}
        {trackView ? (
          <RecentlyViewedTracker
            item={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              brandLine: product.brand?.name ?? undefined,
              imageUrl: primaryImage ?? '',
              price: startingPrice,
              compareAt: product.comparePrice ?? undefined,
              currency: 'PKR',
            }}
          />
        ) : null}
        <Breadcrumb items={[...crumbTrail, { label: product.name }]} />

        <FreeDeliveryBanner variant="compact" />

        <ProductExperience
          productId={product.id}
          productSlug={product.slug}
          productName={product.name}
          brandName={product.brand?.name ?? undefined}
          brandSlug={product.brand?.slug ?? undefined}
          shortDescription={stripSupplierBoilerplate(product.shortDescription) || undefined}
          fullDescription={stripSupplierBoilerplate(product.fullDescription) || undefined}
          skinConcerns={product.skinConcerns}
          ingredients={product.ingredients}
          images={galleryImages}
          variants={variantOptions}
          comparePrice={product.comparePrice ?? undefined}
          flashSale={flashSale}
          currency="PKR"
          fallbackPrice={startingPrice}
          outOfStock={totalStock === 0}
          rating={reviewSummary.average}
          reviewCount={reviewSummary.count}
        />

        {related.length > 0 ? (
          <section className="flex flex-col gap-6 pt-8">
            <header className="flex flex-col gap-1">
              <span className="eyebrow">Goes well with</span>
              <h2 className="editorial-heading text-display-sm">Frequently bought together</h2>
            </header>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ) : null}

        <div id="reviews" className="scroll-mt-24">
          <ProductReviews productId={product.id} summary={reviewSummary} reviews={reviews} />
        </div>

        <RecentlyViewed excludeId={product.id} />

        <JsonLd
          data={breadcrumbJsonLd([
            ...crumbTrail,
            { label: product.name, href: `/products/${slug}` },
          ])}
        />
        <JsonLd
          data={productJsonLd({
            name: product.name,
            slug: product.slug,
            description: product.fullDescription ?? product.shortDescription ?? '',
            category: product.category?.name,
            imageUrl: primaryImage ?? '',
            images: product.images.map((i) => i.imageUrl).filter(Boolean),
            price: startingPrice,
            currency: 'PKR',
            sku: product.sku,
            inStock: totalStock > 0,
            brand: product.brand?.name,
            rating: reviewSummary.count > 0 ? reviewSummary.average : undefined,
            reviewCount: reviewSummary.count,
            reviews: reviews.slice(0, 5).map((r) => ({
              author: r.user?.firstName?.trim() || r.authorName?.trim() || 'Verified buyer',
              rating: r.rating,
              title: r.title,
              body: r.comment,
              date: r.createdAt,
            })),
          })}
        />
      </div>
    </Section>
  );
}
