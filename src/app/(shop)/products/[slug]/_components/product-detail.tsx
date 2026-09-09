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

import { flashSaleService } from '@/server/services/flash-sale.service';
import { productsService } from '@/server/services/products.service';

type PdpProduct = Awaited<ReturnType<typeof productsService.getBySlug>>;

/**
 * Shared product-detail render used by both the public PDP (ISR) and the
 * admin-only preview route. `trackView` renders the view beacon; the preview
 * turns it off so admin previews don't inflate view counts.
 */
export async function ProductDetail({
  slug,
  product,
  trackView = true,
}: {
  slug: string;
  product: PdpProduct;
  trackView?: boolean;
}) {
  // Reviews and related products are enrichment, not the product itself — a
  // transient DB failure on them must not 500 the whole PDP.
  const [related, reviewBundle, flashSummary] = await Promise.all([
    productsService.getRelated(slug, 4).catch(() => []),
    productsService
      .getReviews(product.id, slug)
      .catch(() => ({ summary: { average: 0, count: 0 }, reviews: [] })),
    flashSaleService.liveSummary().catch(() => null),
  ]);
  const reviewSummary = reviewBundle.summary;
  const reviews = reviewBundle.reviews;

  // A live flash sale on THIS product. The discount is applied to variant
  // prices below rather than at the render site, so every downstream consumer —
  // the price block, the optimistic cart line, GA4 add_to_cart, and the JSON-LD
  // offer — reports the price the shopper will actually be charged.
  const flashPercent = flashSummary?.discounts[product.id];
  const flashSale =
    flashPercent !== undefined && flashSummary
      ? { title: flashSummary.title, endsAt: flashSummary.endsAt, discountPercent: flashPercent }
      : null;

  const primaryImage = product.images[0]?.imageUrl;
  const galleryImages = product.images.map((img) => ({
    url: img.imageUrl,
    alt: img.altText ?? product.name,
    variantId: img.variantId,
  }));

  // Parse shade swatches: source labels look like "ST-01 @#DA849D" — pull out
  // the hex colour and a clean name so the UI can show a swatch, not a code.
  const variantOptions = product.variants.map((v) => {
    const label = [v.size, v.shade, v.fragrance].filter(Boolean).join(' · ') || v.sku;
    const hexMatch = label.match(/@#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    const name = label
      .replace(/\s*@#?[0-9a-fA-F]{3,8}\b/i, '')
      .replace(/[·\s]+$/, '')
      .trim();
    const listPrice = Number(v.price);
    return {
      id: v.id,
      name: name || v.sku,
      hex: hexMatch ? `#${hexMatch[1]}` : undefined,
      price: flashSale ? flashPrice(listPrice, flashSale.discountPercent) : listPrice,
      // Only set while a sale runs — it drives the strike-through, and a
      // per-variant original is more honest than the product-level
      // comparePrice, which can overstate the saving on a cheap variant.
      originalPrice: flashSale ? listPrice : undefined,
      stockQuantity: v.stockQuantity,
      isActive: v.isActive,
    };
  });

  // Math.min of an empty list is Infinity — guard so a product whose variants
  // are all deactivated renders 0 rather than "Rs ∞".
  const startingPrice = variantOptions.length ? Math.min(...variantOptions.map((v) => v.price)) : 0;
  const totalStock = product.variants.reduce((sum, v) => sum + v.stockQuantity, 0);

  // Home → Kitchen Accessories → Product. The generic /products level used to
  // sit in the middle, which told Google nothing about what the item IS and
  // pushed link equity to a catalog dump instead of the topical category the
  // product should rank under. When a product has no category we fall back to
  // /products rather than inventing a level.
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
              compareAt: product.comparePrice ? Number(product.comparePrice) : undefined,
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
          // Rendered copy gets the same boilerplate strip as the metadata, so
          // a shopper never lands on a page whose entire description is
          // "Take a look at Portable" and no product page advertises a
          // wholesale price on a direct-to-consumer store.
          shortDescription={stripSupplierBoilerplate(product.shortDescription) || undefined}
          fullDescription={stripSupplierBoilerplate(product.fullDescription) || undefined}
          skinConcerns={product.skinConcerns.map((pc) => ({
            id: pc.skinConcern.id,
            name: pc.skinConcern.name,
          }))}
          ingredients={product.ingredients.map((pi) => ({
            id: pi.ingredient.id,
            name: pi.ingredient.name,
            description: pi.ingredient.description,
          }))}
          images={galleryImages}
          variants={variantOptions}
          comparePrice={product.comparePrice ? Number(product.comparePrice) : undefined}
          flashSale={flashSale}
          currency="PKR"
          fallbackPrice={startingPrice}
          outOfStock={totalStock === 0}
          rating={reviewSummary.average}
          reviewCount={reviewSummary.count}
        />

        {/* Related products */}
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

        {/* Reviews */}
        <div id="reviews" className="scroll-mt-24">
          <ProductReviews productId={product.id} summary={reviewSummary} reviews={reviews} />
        </div>

        {/* Recently viewed (from localStorage; excludes this product) */}
        <RecentlyViewed excludeId={product.id} />

        {/* SEO */}
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
            // Prefer the longer body copy — the cleaner in `productJsonLd`
            // strips the imported "Take a look at…" lead-in and the B2B
            // "Get in wholesale price" line before it reaches Google.
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
              date: r.createdAt.toISOString(),
            })),
          })}
        />
      </div>
    </Section>
  );
}
