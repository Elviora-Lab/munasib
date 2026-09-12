import { SITE_URL, siteConfig, socialProfiles } from '@/config/site';

import { cheapestShippingFrom, shippingFeeForZone } from '@/lib/shipping';

import { absoluteUrl, clamp, cleanCopy } from './metadata';

/**
 * Structured data for the whole storefront.
 *
 * ENTITY STRATEGY. Search engines disambiguate similarly-named brands by the
 * strength and consistency of their entity graph, so every node here is
 * anchored to a stable `@id` rooted at this domain:
 *
 *   {SITE_URL}/#organization  — the business
 *   {SITE_URL}/#website       — the site, `publisher` → the organization
 *   {url}#product             — each product, `seller` → the organization
 *
 * Because the ids are absolute and derived from `SITE_URL`, every page of the
 * site reinforces the SAME node rather than declaring a fresh anonymous one,
 * and nothing here can name another host.
 */

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** Reference to the organization node, for use as `publisher` / `seller`. */
const orgRef = { '@id': ORGANIZATION_ID } as const;

type ProductReview = {
  author: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  date?: string;
};

type Product = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  images?: string[];
  price: number;
  currency: string;
  sku?: string;
  rating?: number;
  reviewCount?: number;
  inStock?: boolean;
  brand?: string;
  /** Primary category name — `Product.category` in schema.org terms. */
  category?: string;
  reviews?: ProductReview[];
};

/**
 * `OnlineStore` (a subtype of Organization) rather than a bare Organization:
 * it states outright that this domain IS the shop, which is the strongest
 * signal available for disambiguating this entity from any similarly-named
 * business.
 */
export function organizationJsonLd() {
  const profiles = socialProfiles();
  const { business } = siteConfig;
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': ORGANIZATION_ID,
    name: siteConfig.name,
    alternateName: siteConfig.alternateName,
    url: `${SITE_URL}/`,
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#logo`,
      url: absoluteUrl('/logo.png'),
      caption: siteConfig.name,
    },
    image: absoluteUrl('/logo.png'),
    description: siteConfig.description,
    email: siteConfig.contact.email,
    telephone: siteConfig.contact.phone,
    currenciesAccepted: siteConfig.defaultCurrency,
    paymentAccepted: 'Cash on Delivery, Credit Card, Debit Card',
    // Only assert profiles we actually own — a `sameAs` pointing at another
    // business's page invites Google to merge the two entities.
    ...(profiles.length ? { sameAs: profiles } : {}),
    areaServed: { '@type': 'Country', name: business.countryName },
    // City-level only: a street address in structured data is a checkable
    // claim, and there is no walk-in location to back one.
    address: {
      '@type': 'PostalAddress',
      addressLocality: business.city,
      addressRegion: business.region,
      addressCountry: business.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: siteConfig.contact.email,
      telephone: siteConfig.contact.phone,
      areaServed: business.country,
      availableLanguage: ['en', 'ur'],
    },
  } as const;
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: siteConfig.name,
    alternateName: siteConfig.alternateName,
    url: `${SITE_URL}/`,
    description: siteConfig.description,
    inLanguage: siteConfig.locale,
    publisher: orgRef,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  } as const;
}

/**
 * Delivery terms as published on /shipping, derived from the same rate card
 * the checkout charges from (`@/lib/shipping`) so schema, copy, and the actual
 * bill can never drift apart. `minValue: 0` is the free-shipping tier.
 */
function shippingDetails() {
  const { policy, business, defaultCurrency } = siteConfig;
  const dearestZoneFee = Math.max(
    shippingFeeForZone('within_city'),
    shippingFeeForZone('same_province'),
    shippingFeeForZone('province_to_province'),
  );
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: {
      '@type': 'MonetaryAmount',
      minValue: 0,
      maxValue: Math.max(dearestZoneFee, cheapestShippingFrom(1)),
      currency: defaultCurrency,
    },
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: business.country,
    },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: {
        '@type': 'QuantitativeValue',
        minValue: 0,
        maxValue: policy.handlingDaysMax,
        unitCode: 'DAY',
      },
      transitTime: {
        '@type': 'QuantitativeValue',
        minValue: policy.deliveryDaysMin,
        maxValue: policy.deliveryDaysMax,
        unitCode: 'DAY',
      },
    },
  } as const;
}

export function productJsonLd(p: Product) {
  const url = absoluteUrl(`/products/${p.slug}`);
  // Keep the offer valid ~a year out so Google never flags the price as expired.
  const priceValidUntil = `${new Date().getFullYear() + 1}-12-31`;
  // The stored description is supplier copy of wildly varying quality; the same
  // cleaner that guards the meta description guards the schema one, so Google
  // never receives a `description` of "Take a look at".
  const description = clamp(cleanCopy(p.description), 400);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    ...(description ? { description } : {}),
    image: p.images?.length ? p.images : [p.imageUrl],
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.category ? { category: p.category } : {}),
    brand: { '@type': 'Brand', name: p.brand ?? siteConfig.name },
    url,
    offers: {
      '@type': 'Offer',
      price: p.price.toFixed(2),
      priceCurrency: p.currency,
      priceValidUntil,
      itemCondition: 'https://schema.org/NewCondition',
      availability:
        p.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      url,
      seller: orgRef,
      shippingDetails: shippingDetails(),
      // A short 2–3 day returns window is the store-wide, advertised policy.
      // Structured data takes a single number, so we declare the outer bound (3).
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: siteConfig.business.country,
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: siteConfig.policy.returnDays,
        returnMethod: 'https://schema.org/ReturnByMail',
      },
    },
    // Ratings and reviews are emitted ONLY from real, approved review rows.
    // Never synthesise these to win a rich snippet.
    ...(typeof p.rating === 'number' && typeof p.reviewCount === 'number' && p.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: p.rating.toFixed(1),
            reviewCount: p.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(p.reviews?.length
      ? {
          review: p.reviews.map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: r.author },
            reviewRating: {
              '@type': 'Rating',
              ratingValue: r.rating,
              bestRating: 5,
              worstRating: 1,
            },
            ...(r.title ? { name: r.title } : {}),
            ...(r.body ? { reviewBody: r.body } : {}),
            ...(r.date ? { datePublished: r.date } : {}),
          })),
        }
      : {}),
  } as const;
}

type Article = {
  title: string;
  description: string;
  slug: string;
  image?: string | null;
  publishedAt?: Date | null;
  modifiedAt?: Date | null;
};

export function articleJsonLd(a: Article) {
  const url = absoluteUrl(`/blog/${a.slug}`);
  const published = a.publishedAt?.toISOString();
  const modified = (a.modifiedAt ?? a.publishedAt)?.toISOString();
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: clamp(cleanCopy(a.title), 110),
    description: clamp(cleanCopy(a.description), 300),
    ...(a.image ? { image: [a.image] } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    inLanguage: siteConfig.locale,
    author: { '@type': 'Organization', name: siteConfig.name, url: `${SITE_URL}/` },
    publisher: orgRef,
    isPartOf: { '@id': WEBSITE_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  } as const;
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  } as const;
}

/**
 * ItemList for a product listing / category page — helps Google understand the
 * collection and can surface it as a rich list. Positions are 1-based and point
 * at each product's canonical PDP URL.
 */
export function itemListJsonLd(items: { name: string; slug: string }[], opts: { path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: absoluteUrl(opts.path),
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/products/${it.slug}`),
      name: it.name,
    })),
  } as const;
}

/**
 * `CollectionPage` for a category listing. Wraps the product ItemList in a page
 * node that is explicitly `isPartOf` the site and `about` its subject, which is
 * what lets Google treat a category URL as a topical landing page rather than
 * an anonymous grid of links.
 */
export function collectionPageJsonLd(input: {
  name: string;
  description: string;
  path: string;
  items: { name: string; slug: string }[];
}) {
  const url = absoluteUrl(input.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    name: input.name,
    description: clamp(cleanCopy(input.description), 300),
    url,
    inLanguage: siteConfig.locale,
    isPartOf: { '@id': WEBSITE_ID },
    ...(input.items.length
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: input.items.length,
            itemListElement: input.items.map((it, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: absoluteUrl(`/products/${it.slug}`),
              name: it.name,
            })),
          },
        }
      : {}),
  } as const;
}

/**
 * A static content page (About, Contact, policies). `AboutPage` / `ContactPage`
 * carry more meaning than a bare WebPage and are the pages Google leans on when
 * deciding whether a store is a real, trustworthy business.
 */
export function webPageJsonLd(input: {
  type?: 'WebPage' | 'AboutPage' | 'ContactPage';
  name: string;
  description: string;
  path: string;
}) {
  const url = absoluteUrl(input.path);
  return {
    '@context': 'https://schema.org',
    '@type': input.type ?? 'WebPage',
    '@id': `${url}#webpage`,
    name: input.name,
    description: clamp(cleanCopy(input.description), 300),
    url,
    inLanguage: siteConfig.locale,
    isPartOf: { '@id': WEBSITE_ID },
    about: orgRef,
    publisher: orgRef,
  } as const;
}

export function breadcrumbJsonLd(items: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  } as const;
}
