import type { Metadata } from 'next';

import { SITE_URL, siteConfig } from '@/config/site';

import { normalizeProductCopy } from './product-copy';

/**
 * Centralised metadata factory.
 *
 * Everything that produces a `<title>`, meta description, canonical, or social
 * card goes through here. Two reasons it is centralised rather than written
 * per-page:
 *
 *  1. Domain safety. Every absolute URL is built from {@link SITE_URL} via
 *     {@link absoluteUrl}, so no page can accidentally canonicalise to the
 *     wrong host (e.g. a stray hardcoded domain, or a similarly-named
 *     business's URL).
 *  2. Scale. The catalog is ~580 products and growing; per-page metadata does
 *     not survive that. The `generate*Metadata` helpers below take a DB row and
 *     return a complete, unique, length-budgeted `Metadata` object.
 */

// Google renders roughly 580px of title — about 60 characters at typical
// widths. These are soft budgets: a longer title is truncated, not penalised,
// so we prefer a complete product name over a mangled one.
const TITLE_BUDGET = 60;
const BRAND_SUFFIX = ` | ${siteConfig.name}`;
/** Longest a product name may run before we clamp it at a word boundary. */
const NAME_CLAMP = 70;
const DESCRIPTION_BUDGET = 155;
/** Below this, a description is too thin to be worth serving — compose instead. */
const DESCRIPTION_FLOOR = 70;

/**
 * The ONLY sanctioned way to build an absolute URL for this site.
 *
 * @param path Root-relative path, with or without a leading slash. Query
 *   strings are preserved (used by self-referencing paginated canonicals).
 */
export function absoluteUrl(path = '/'): string {
  return new URL(path.startsWith('/') ? path : `/${path}`, `${SITE_URL}/`).toString();
}

// ---------------------------------------------------------------------------
//  Copy normalisation
// ---------------------------------------------------------------------------

/**
 * Strip supplier boilerplate and flatten to plain text for a meta tag or a
 * JSON-LD `description`.
 *
 * The rules live in `./product-copy` — the artifact catalogue outgrew this
 * module once the full audit landed (source-shop price boilerplate, city-list
 * spam, another shop's returns policy, HTML entities, and the dangling
 * attributions the importer's own brand-scrubbing left behind). These two
 * functions stay as the SEO layer's entry points.
 *
 * Returns an empty string when nothing meaningful survives — callers treat
 * that as "no description", not as a description of "".
 */
export function cleanCopy(input?: string | null): string {
  return normalizeProductCopy(input);
}

/**
 * As {@link cleanCopy}, but preserves line breaks and markdown for copy that is
 * rendered on the page through `<RichText>` rather than flattened into a tag.
 */
export function stripSupplierBoilerplate(input?: string | null): string {
  return normalizeProductCopy(input, { preserveStructure: true });
}

/**
 * Clamp to `max` characters on a word boundary, appending an ellipsis only
 * when text was actually removed. Never cuts mid-word — a description ending
 * "…Leak Resistan" reads as broken data, which is exactly the state this
 * whole module exists to fix.
 */
export function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.—-]+$/, '')}…`;
}

/**
 * Pick the first candidate that survives cleaning and clears the quality floor,
 * then clamp it to the SERP budget. Falls back to `fallback` (used verbatim,
 * assumed already sound) when every candidate is junk.
 */
export function metaDescription(candidates: Array<string | null | undefined>, fallback: string) {
  for (const candidate of candidates) {
    const cleaned = cleanCopy(candidate);
    if (cleaned.length >= DESCRIPTION_FLOOR) return clamp(cleaned, DESCRIPTION_BUDGET);
  }
  return clamp(fallback, DESCRIPTION_BUDGET);
}

/** Append the brand suffix unless the title already names the brand. */
function withBrand(title: string): string {
  return new RegExp(`\\b${siteConfig.name}\\b`, 'i').test(title)
    ? title
    : `${title}${BRAND_SUFFIX}`;
}

// ---------------------------------------------------------------------------
//  Base builder
// ---------------------------------------------------------------------------

type BuildMetadataInput = {
  /** Page title WITHOUT the brand suffix — it is appended here. */
  title?: string;
  /** Pre-composed title used verbatim (already carries its own brand suffix). */
  rawTitle?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  keywords?: string[];
  /** Open Graph object type — `article` for blog posts, `website` otherwise. */
  ogType?: 'website' | 'article';
};

export function buildMetadata({
  title,
  rawTitle,
  description = siteConfig.description,
  path,
  image,
  noIndex,
  keywords,
  ogType = 'website',
}: BuildMetadataInput = {}): Metadata {
  const fullTitle =
    rawTitle ?? (title ? withBrand(title) : `${siteConfig.name} — ${siteConfig.positioning}`);
  const canonical = absoluteUrl(path ?? '/');
  // A `noindex` page that also declares a canonical pointing at the homepage is
  // a contradictory pair of signals, and roughly thirty admin/account/auth
  // pages were doing exactly that by omitting `path` and inheriting the '/'
  // default. When a page is both noindex and hasn't named its own URL, emit no
  // canonical at all rather than a wrong one.
  const declareCanonical = path !== undefined || !noIndex;
  // Only set an explicit image (e.g. a product photo). When none is given we
  // omit `images` so Next's file-based `opengraph-image` (the branded card)
  // supplies it — pointing at a hardcoded path that doesn't exist just yields
  // broken share previews.
  const explicitImages = image
    ? [{ url: image, width: 1200, height: 630, alt: fullTitle }]
    : undefined;

  return {
    metadataBase: new URL(SITE_URL),
    title: fullTitle,
    description,
    // Meta keywords are ignored by Google and repeating one site-wide list on
    // every page is pure noise, so they are emitted only when a page passes a
    // deliberate set (the homepage does).
    ...(keywords?.length ? { keywords } : {}),
    ...(declareCanonical ? { alternates: { canonical } } : {}),
    openGraph: {
      type: ogType,
      siteName: siteConfig.name,
      title: fullTitle,
      description,
      url: canonical,
      // OG spec wants an underscore locale (en_PK), not the BCP-47 hyphen form.
      locale: siteConfig.locale.replace('-', '_'),
      ...(explicitImages ? { images: explicitImages } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      ...(image ? { images: [image] } : {}),
    },
    robots: noIndex
      ? // `follow` stays on: these pages (cart, search, single-brand listing)
        // still link to real products, and we want that equity to flow.
        { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
        },
    // Icons are provided by the app/ file convention (icon.svg, icon.png,
    // apple-icon.png), which Next injects into every page automatically.
  };
}

export const defaultMetadata: Metadata = {
  ...buildMetadata({ keywords: [...siteConfig.keywords] }),
  verification: {
    google: 'ODwySYaXf8h76ufWE4IN7ii1JYDDJ-Y_UJgda8r2Bhs',
  },
};

// ---------------------------------------------------------------------------
//  Product
// ---------------------------------------------------------------------------

export type ProductMetadataInput = {
  name: string;
  slug: string;
  /** Merchandiser override from `products.seo_title`. */
  seoTitle?: string | null;
  seoDescription?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  categoryName?: string | null;
  image?: string | null;
  inStock?: boolean;
};

/**
 * Product title.
 *
 * `"<name> Price in Pakistan | Munasib"` is only used when the name is short
 * enough that the composed title still fits the SERP budget. That length test
 * is a deliberate proxy for intent, not a formatting convenience: the short
 * names in this catalog are the generic product types people actually
 * price-shop ("Speedy Chopper", "Electric Lint Remover"), while the long ones
 * are already specific enough to carry their own long-tail and would only be
 * truncated. The modifier is therefore never appended blindly to all 580 PDPs.
 *
 * A merchandiser value in `products.seo_title` that differs from the product
 * name is treated as a deliberate override and wins outright.
 */
export function productTitle(product: Pick<ProductMetadataInput, 'name' | 'seoTitle'>): string {
  const override = cleanCopy(product.seoTitle);
  const name = clamp(cleanCopy(product.name) || product.name, NAME_CLAMP);

  if (override && override.toLowerCase() !== cleanCopy(product.name).toLowerCase()) {
    return withBrand(override);
  }

  const withModifier = `${name} Price in Pakistan`;
  if (withModifier.length + BRAND_SUFFIX.length <= TITLE_BUDGET + 4) {
    return withBrand(withModifier);
  }
  return withBrand(name);
}

export function generateProductMetadata(product: ProductMetadataInput): Metadata {
  const name = cleanCopy(product.name) || product.name;
  const category = product.categoryName ? ` ${product.categoryName.toLowerCase()}` : '';
  // Composed only when every stored description is junk. Says nothing about the
  // product beyond its own name and our published delivery policy — inventing
  // materials, dimensions, or capacity here would be a fabrication.
  const composed = `Buy ${name} online in Pakistan at ${siteConfig.name}. Cash on delivery nationwide, easy ${siteConfig.policy.returnDays}-day returns${category ? ` on${category}` : ''}.`;

  return buildMetadata({
    rawTitle: productTitle(product),
    description: metaDescription(
      [product.seoDescription, product.shortDescription, product.fullDescription],
      composed,
    ),
    path: `/products/${product.slug}`,
    image: product.image ?? undefined,
  });
}

// ---------------------------------------------------------------------------
//  Category / collection
// ---------------------------------------------------------------------------

export type CategoryMetadataInput = {
  slug: string;
  name: string;
  /** Hand-written title from `@/config/category-seo`, when one exists. */
  seoTitle?: string;
  seoDescription?: string;
  description?: string | null;
  page?: number;
};

/**
 * Category metadata. Page 2+ gets its own title and a self-referencing
 * canonical so Google keeps crawling deeper listings instead of folding them
 * into page 1; sort/brand variants still collapse onto the clean URL.
 */
export function generateCategoryMetadata(input: CategoryMetadataInput): Metadata {
  const page = Math.max(1, input.page ?? 1);
  const base = input.seoTitle ?? `${input.name} Online in Pakistan`;
  const title = page > 1 ? `${base} — Page ${page}` : base;

  return buildMetadata({
    rawTitle: withBrand(title),
    description: metaDescription(
      [input.seoDescription, input.description],
      `Shop ${input.name.toLowerCase()} online in Pakistan at ${siteConfig.name}. ${siteConfig.shortDescription}`,
    ),
    path: page > 1 ? `/categories/${input.slug}?page=${page}` : `/categories/${input.slug}`,
  });
}

// ---------------------------------------------------------------------------
//  Article
// ---------------------------------------------------------------------------

export type ArticleMetadataInput = {
  slug: string;
  title: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  content?: string | null;
  image?: string | null;
};

export function generateArticleMetadata(post: ArticleMetadataInput): Metadata {
  const title = cleanCopy(post.seoTitle) || cleanCopy(post.title) || post.title;
  return buildMetadata({
    rawTitle: withBrand(title),
    description: metaDescription(
      [post.seoDescription, post.content],
      `${cleanCopy(post.title)} — a practical home guide from ${siteConfig.name}.`,
    ),
    path: `/blog/${post.slug}`,
    image: post.image ?? undefined,
    ogType: 'article',
  });
}
