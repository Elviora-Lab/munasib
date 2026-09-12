import { describe, expect, it } from 'vitest';

import { CATEGORY_SEO, categorySlugsForGuide } from '@/config/category-seo';
import { siteConfig } from '@/config/site';

import { organizationJsonLd, productJsonLd, websiteJsonLd } from '@/lib/seo/json-ld';
import {
  absoluteUrl,
  buildMetadata,
  clamp,
  cleanCopy,
  generateProductMetadata,
  metaDescription,
  productTitle,
  stripSupplierBoilerplate,
} from '@/lib/seo/metadata';

describe('cleanCopy', () => {
  it('strips the imported "Take a look at" lead-in', () => {
    expect(cleanCopy('Take a look at Heart Shape Jewellery Box')).toBe('Heart Shape Jewellery Box');
  });

  it('strips the lead-in mid-string, not just at the start', () => {
    expect(cleanCopy('Fridge Basket! Take a look at Fridge Basket Description: slides out.')).toBe(
      'Fridge Basket! Fridge Basket Description: slides out.',
    );
  });

  it('removes B2B wholesale boilerplate from consumer copy', () => {
    expect(cleanCopy('Airtight lid for safe storage. Get in wholesale price.')).toBe(
      'Airtight lid for safe storage.',
    );
  });

  it('returns empty for copy that is nothing but a truncated lead-in', () => {
    expect(cleanCopy('Take a')).toBe('');
    expect(cleanCopy('Take a look at')).toBe('');
  });

  it('flattens markdown so it never reaches a meta tag', () => {
    expect(cleanCopy('## Features\n- **Leakproof** lid\n- Easy pour')).toBe(
      'Features Leakproof lid Easy pour',
    );
  });
});

describe('stripSupplierBoilerplate', () => {
  it('removes boilerplate but keeps line structure for on-page rendering', () => {
    const input = 'Take a look at Storage Box\n\n- Stackable\n- Dustproof\nGet in wholesale price';
    expect(stripSupplierBoilerplate(input)).toBe('Storage Box\n\n- Stackable\n- Dustproof');
  });

  it('keeps markdown list markers intact', () => {
    // Regression: the stray-punctuation trim used to eat the "- " off bullets,
    // collapsing every PDP feature list into prose.
    expect(stripSupplierBoilerplate('# Features\n- One\n- Two')).toBe('# Features\n- One\n- Two');
  });
});

describe('supplier-import artifact repair', () => {
  it('removes the preposition the importer orphaned when it deleted a brand', () => {
    // Shipped to production as: "…the Hand-Pulled Speedy Chopper by ."
    expect(cleanCopy('Cut prep time in half with the Speedy Chopper by . Designed for ease.')).toBe(
      'Cut prep time in half with the Speedy Chopper. Designed for ease.',
    );
    expect(cleanCopy('Meet the Fry & Strain Pot from —your all-in-one solution.')).toBe(
      'Meet the Fry & Strain Pot — your all-in-one solution.',
    );
  });

  it('decodes HTML entities so they cannot double-encode in a meta tag', () => {
    expect(cleanCopy('Quick, Cordless &amp; Hassle-Free')).toBe('Quick, Cordless & Hassle-Free');
  });

  it('decodes &amp; last so an escaped entity is not resolved twice', () => {
    expect(cleanCopy('Compare 5 &amp;lt; 10')).toBe('Compare 5 &lt; 10');
  });

  it("drops another shop's price template and its city list", () => {
    const input =
      'Wide Traders has the best prices of Toothbrush Cover in Pakistan with fast delivery in all major cities of Pakistan. Including Karachi, Lahore, Multan, Islamabad, and many more cities at the lowest price. Compact and travel-friendly design.';
    expect(cleanCopy(input)).toBe('Compact and travel-friendly design.');
  });

  it("drops another shop's returns window rather than restating it", () => {
    // Our published policy is 3 days. Serving a scraped "7 days" is a false
    // promise to the customer, so it is removed, not corrected.
    expect(cleanCopy('Durable build. Hassle free 7 days return policy')).toBe('Durable build.');
    expect(cleanCopy('Hassle free 7 days return policy')).not.toMatch(/\d+\s*days/);
  });

  it('drops the generic "Why Buy From Us" block, including the source typo', () => {
    expect(cleanCopy('Easy DIY installation Why Buy From You High quality adhesive backing')).toBe(
      'Easy DIY installation',
    );
    expect(cleanCopy('Portable. Why Buy From Us: Fast delivery & trusted service')).toBe(
      'Portable.',
    );
  });

  it('restores the boundary where a lost newline welded a heading to the body', () => {
    expect(cleanCopy('Quick & Easy Food PrepKitchen Accessories Features: sharp blades')).toBe(
      'Quick & Easy Food Prep — Kitchen Accessories Features: sharp blades',
    );
  });

  it('leaves an honest description completely untouched', () => {
    const good =
      'A 10kg airtight rice dispenser with a measured pour spout, sized to sit under a standard counter.';
    expect(cleanCopy(good)).toBe(good);
  });

  it('returns empty rather than a stub when only boilerplate was there', () => {
    expect(cleanCopy('Take a look at Get in wholesale price')).toBe('');
  });
});

describe('clamp', () => {
  it('leaves text within budget untouched', () => {
    expect(clamp('short text', 40)).toBe('short text');
  });

  it('cuts on a word boundary rather than mid-word', () => {
    const out = clamp('Leak resistant lid for safe everyday storage', 20);
    expect(out).toBe('Leak resistant lid…');
    expect(out.length).toBeLessThanOrEqual(20);
  });
});

describe('metaDescription', () => {
  it('skips candidates that fall below the quality floor', () => {
    expect(metaDescription(['Take a look at', 'Take a'], 'composed fallback')).toBe(
      'composed fallback',
    );
  });

  it('uses the first candidate that clears the floor', () => {
    const good =
      'A 10kg airtight rice dispenser that keeps cereal and grains dry, with a measured pour spout.';
    expect(metaDescription(['Take a', good], 'fallback')).toBe(good);
  });

  it('never returns more than 155 characters', () => {
    const long = 'word '.repeat(200);
    expect(metaDescription([long], 'fallback').length).toBeLessThanOrEqual(155);
  });
});

describe('productTitle', () => {
  it('appends the price modifier only when the name is short enough to fit', () => {
    expect(productTitle({ name: 'Water Bottle Lifter', seoTitle: null })).toBe(
      'Water Bottle Lifter Price in Pakistan | Munasib',
    );
  });

  it('omits the price modifier on long descriptive names', () => {
    const name = 'Cute Heart-Shaped Jewellery Box — Velvet Interior Organizer';
    expect(productTitle({ name, seoTitle: null })).toBe(`${name} | Munasib`);
  });

  it('treats a seo_title that differs from the name as a deliberate override', () => {
    expect(productTitle({ name: 'Manual Chopper', seoTitle: 'Speedy Chopper — Best Seller' })).toBe(
      'Speedy Chopper — Best Seller | Munasib',
    );
  });

  it('does not double the brand when the override already names it', () => {
    const title = productTitle({ name: 'Chopper', seoTitle: 'Chopper Deals at Munasib' });
    expect(title.match(/Munasib/g)).toHaveLength(1);
  });
});

describe('generateProductMetadata', () => {
  it('composes a truthful description when every stored field is junk', () => {
    const meta = generateProductMetadata({
      name: 'Silicone Funnel',
      slug: 'silicone-funnel',
      seoDescription: 'Take a look at',
      shortDescription: 'Take a',
      fullDescription: null,
      categoryName: 'Kitchen Accessories',
    });
    // States only the product name and published policy — no invented specs.
    expect(meta.description).toContain('Silicone Funnel');
    expect(meta.description).toContain('Pakistan');
    expect(meta.description).not.toMatch(/take a look/i);
  });

  it('canonicalises to the .com.pk origin, never another host', () => {
    const meta = generateProductMetadata({ name: 'Jug', slug: 'jug' });
    expect(String(meta.alternates?.canonical)).toBe(absoluteUrl('/products/jug'));
    expect(String(meta.alternates?.canonical)).toContain(siteConfig.url);
  });
});

describe('buildMetadata canonicals', () => {
  it('emits no canonical for a noindex page that never named its own URL', () => {
    expect(buildMetadata({ title: 'Admin', noIndex: true }).alternates).toBeUndefined();
  });

  it('still emits a canonical when a noindex page names its path', () => {
    expect(String(buildMetadata({ path: '/cart', noIndex: true }).alternates?.canonical)).toBe(
      absoluteUrl('/cart'),
    );
  });

  it('keeps noindex pages followable so their outbound links still count', () => {
    expect(buildMetadata({ noIndex: true }).robots).toMatchObject({ index: false, follow: true });
  });
});

describe('entity signals', () => {
  it('anchors the organization to a stable @id on this domain', () => {
    const org = organizationJsonLd();
    expect(org['@id']).toBe(`${siteConfig.url}/#organization`);
    expect(org['@type']).toBe('OnlineStore');
  });

  it('points the website node at the organization as publisher', () => {
    expect(websiteJsonLd().publisher['@id']).toBe(organizationJsonLd()['@id']);
  });
});

describe('productJsonLd', () => {
  const base = {
    name: 'Rice Dispenser',
    slug: 'rice-dispenser',
    description: 'Take a look at Rice Dispenser. Airtight. Get in wholesale price',
    imageUrl: 'https://cdn.example.com/a.jpg',
    price: 1499,
    currency: 'PKR',
  };

  it('cleans supplier boilerplate out of the schema description too', () => {
    const ld = productJsonLd(base);
    expect(ld.description).toBe('Rice Dispenser. Airtight.');
  });

  it('omits aggregateRating when there are no real reviews', () => {
    expect(productJsonLd(base)).not.toHaveProperty('aggregateRating');
    expect(productJsonLd({ ...base, rating: 4.5, reviewCount: 0 })).not.toHaveProperty(
      'aggregateRating',
    );
  });

  it('emits aggregateRating only from genuine review counts', () => {
    const ld = productJsonLd({ ...base, rating: 4.5, reviewCount: 12 });
    expect(ld).toHaveProperty('aggregateRating');
  });

  it('prices in PKR and marks out-of-stock honestly', () => {
    const ld = productJsonLd({ ...base, inStock: false });
    expect(ld.offers.priceCurrency).toBe('PKR');
    expect(ld.offers.availability).toBe('https://schema.org/OutOfStock');
  });
});

describe('category SEO config', () => {
  const entries = Object.entries(CATEGORY_SEO);

  it('gives every category a unique title and meta description', () => {
    expect(new Set(entries.map(([, s]) => s.title)).size).toBe(entries.length);
    expect(new Set(entries.map(([, s]) => s.description)).size).toBe(entries.length);
  });

  it('keeps meta descriptions inside the SERP budget', () => {
    for (const [slug, seo] of entries) {
      expect(seo.description.length, slug).toBeLessThanOrEqual(160);
      expect(seo.description.length, slug).toBeGreaterThanOrEqual(100);
    }
  });

  it('never reuses a body paragraph between categories', () => {
    const paragraphs = entries.flatMap(([, s]) => s.body.map((b) => b.text));
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
  });

  it('only cross-links to categories that exist in the config', () => {
    for (const [slug, seo] of entries) {
      for (const related of seo.related) {
        expect(CATEGORY_SEO, `${slug} → ${related}`).toHaveProperty(related);
      }
      expect(seo.related, slug).not.toContain(slug);
    }
  });

  it('resolves guide → category links back to the categories that declared them', () => {
    expect(categorySlugsForGuide('kitchen-cabinet-organizing-guide')).toContain(
      'kitchen-accessories',
    );
    expect(categorySlugsForGuide('not-a-real-post')).toEqual([]);
  });
});
