/**
 * Importer — loads a scraped catalog's `products.json` into Postgres.
 *
 * Run with `npm run db:import` (she-beauty, the default) or
 * `npm run db:import:smtraders`. Pass `--dataset=<name>` to pick another.
 * Idempotent: products/categories/brand/reviews are upserted; variants are
 * inserted with skipDuplicates (unique SKU); a product's images are replaced
 * on each run.
 *
 * Each dataset's `products.json` holds one entry per product with nested
 * `variants`, `images`, and `reviews`. The sources have no real SKUs or stock
 * counts, so we synthesize stable SKUs from the Shopify ids and default stock
 * from each variant's `available` flag. Scraped reviews have a name but no
 * account, so we create one synthetic user per reviewer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma, PrismaClient } from '@prisma/client';

import { normalizeProductCopy } from '../src/lib/seo/product-copy';
import { reconcileStockLedger } from './stock-ledger';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------
/**
 * Per-crawl settings. `dir` is relative to `data/`; every dataset ships the
 * same scraper output shape (products.json + optional collections.csv).
 * `skuPrefix` namespaces synthesized SKUs so two datasets can share a database
 * without colliding on the unique SKU constraint.
 */
type Dataset = {
  dir: string;
  brandName: string;
  brandSlug: string;
  skuPrefix: string;
  /** Preferred primary category when a product lists several. */
  categoryPriority: string[];
};

const DATASETS: Record<string, Dataset> = {
  'she-beauty': {
    dir: '.',
    brandName: 'She Beauty',
    brandSlug: 'she-beauty',
    skuPrefix: 'SB',
    categoryPriority: ['Lips', 'Eyes', 'Face', 'Nails'],
  },
  smtraders: {
    dir: 'smtraders',
    brandName: 'Munasib',
    brandSlug: 'munasib',
    skuPrefix: 'SMT',
    // Prefer a concrete product category over the catch-all buckets, so a
    // product tagged "Kitchen Accessories|Random Gadgets" lands in the former.
    categoryPriority: [
      'Kitchen Accessories',
      'Home & Living',
      'Wardrobe & Organizers',
      'Home & Wall Decor',
      'Health & Beauty',
      'Babies & Toys',
      'Mobile Accessories',
      'Random Gadgets',
    ],
  },
};

const datasetName =
  process.argv.find((a) => a.startsWith('--dataset='))?.split('=')[1] ??
  process.env.IMPORT_DATASET ??
  'she-beauty';

const dataset = DATASETS[datasetName];
if (!dataset) {
  console.error(
    `[import] unknown dataset '${datasetName}'. Known: ${Object.keys(DATASETS).join(', ')}`,
  );
  process.exit(1);
}

const dataPath = (file: string) => join(process.cwd(), 'data', dataset.dir, file);

// ---------------------------------------------------------------------------
// Source types (only the fields we use)
// ---------------------------------------------------------------------------
type SourceVariant = {
  variant_id: number;
  price: number | null;
  compare_at_price: number | null;
  color: string | null;
  shade: string | null;
  size: string | null;
  weight: number | null;
  available: boolean | null;
};
type SourceImage = {
  image_id: number;
  url: string;
  alt_text: string | null;
  position: number | null;
  image_type: string | null;
  variant_ids?: number[];
};
type SourceReview = {
  review_id: string;
  user_name: string | null;
  rating: number | null;
  title: string | null;
  review_text: string | null;
  verified_purchase: boolean | null;
  date: string | null;
};
type SourceProduct = {
  product_id: number;
  handle: string;
  product_name: string;
  brand: string | null;
  categories: string[] | null;
  current_price: number | null;
  compare_at_price: number | null;
  description_plain: string | null;
  meta_title: string | null;
  meta_description: string | null;
  bestseller: boolean | null;
  featured: boolean | null;
  published_at: string | null;
  created_at: string | null;
  variants: SourceVariant[];
  images: SourceImage[];
  reviews: SourceReview[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

// ---------------------------------------------------------------------------
// Text sanitation
// ---------------------------------------------------------------------------
/**
 * Scraped copy is written for the SOURCE shop: titles are suffixed with its
 * name, and most descriptions open with an SEO template ("<shop> has the best
 * prices of X in Pakistan … at the lowest price") followed by a city list.
 * Some copy also name-drops rival marketplaces. None of that may reach our
 * storefront, so every text field is run through `sanitize()` on import.
 *
 * Deliberately NOT a blanket sentence-drop: much of this copy has no sentence
 * punctuation at all, so dropping any sentence containing the shop name emptied
 * ~210 fields outright in testing. Instead the known template is removed as a
 * unit, rival-marketplace sentences are dropped only when other sentences
 * survive, and anything left is reduced to token removal plus tidy-up.
 */
// Source shops seen across the imported datasets. A name missing from this
// list means its whole "<Shop> has the best prices of X in Pakistan …" template
// survives import — that is how three products shipped with a rival's city-list
// spam intact. `normalizeProductCopy` below carries a shop-agnostic version of
// the same template as a backstop, so a new source degrades rather than leaks.
const SHOP_PATTERN = String.raw`smtraders(?:\.pk)?|sm\s+traders|wide\s+traders`;
const RIVAL_PATTERN = String.raw`daraz|aliexpress|alibaba|amazon|ebay`;
// `\b` is useless here: the source glues names onto separator runs
// ("Chopper_______smtraders.pk") and `_` is a word character, so \b never
// matches at that seam. Explicit alphanumeric boundaries do.
const L = String.raw`(?<![A-Za-z0-9])`;
const R = String.raw`(?![A-Za-z0-9])`;
const BANNED_RE = new RegExp(`${L}(?:${SHOP_PATTERN}|${RIVAL_PATTERN})${R}`, 'gi');
const BOILERPLATE_RE = new RegExp(
  `${L}(?:${SHOP_PATTERN})${R}` +
    String.raw`\s*has\s+the\s+best\s+prices?\s+of\b[\s\S]*?` +
    String.raw`(?:at\s+the\s+lowest\s+price\b\.?|and\s+many\s+more\s+cities\b[^.]*\.?|$)`,
  'gi',
);
const RIVAL_SENTENCE_RE = new RegExp(`[^.!?]*${L}(?:${RIVAL_PATTERN})${R}[^.!?]*[.!?]`, 'gi');
const SHOP_TITLE_SUFFIX_RE = new RegExp(String.raw`\s*[–—|-]\s*(?:${SHOP_PATTERN})\s*$`, 'i');

function tidy(input: string): string {
  return input
    .replace(/_{2,}/g, ' ') // decorative underscore runs used as separators
    .replace(/\s*\|\s*/g, ' ') // separators orphaned by a removed token
    .replace(/\s*([,;])\s*(?=[,;.])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\W+/, '')
    .replace(/^[\s|–—-]+|[\s|–—-]+$/g, '')
    .trim();
}

/** Strip source-shop and rival-marketplace references from scraped copy. */
function sanitize(text: string | null | undefined): string | null {
  if (!text) return null;
  // \xa0 is rife in this source and breaks the \s+ boundaries below.
  let t = text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(BOILERPLATE_RE, ' ');
  const withoutRivals = t.replace(RIVAL_SENTENCE_RE, ' ');
  if (tidy(withoutRivals)) t = withoutRivals; // never blank the field entirely
  t = t.replace(BANNED_RE, '');
  // Shared artifact rules, applied AFTER token removal — deliberately, because
  // `BANNED_RE` is what CREATES the worst of them: deleting the shop name from
  // "…the Speedy Chopper by smtraders." leaves "…the Speedy Chopper by .",
  // which is what shipped to production. The same module runs at read time, so
  // rows imported before this fix are repaired on the way out too.
  const out = normalizeProductCopy(tidy(t), { preserveStructure: true });
  return out || null;
}

/** As `sanitize`, plus the trailing "– <Shop>" suffix scraped titles carry. */
function sanitizeTitle(text: string | null | undefined): string | null {
  if (!text) return null;
  return sanitize(text.replace(/ /g, ' ').replace(SHOP_TITLE_SUFFIX_RE, ''));
}

const truncate = (s: string | null | undefined, max: number) => (s ? s.trim().slice(0, max) : null);

const dec = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n.toFixed(2)));

const clampRating = (r: number | null | undefined) =>
  Math.min(5, Math.max(1, Math.round(r ?? 0))) || 1;

// Prefer a real product-type category over merchandising collections.
function pickCategory(categories: string[] | null): string | null {
  if (!categories?.length) return null;
  return dataset.categoryPriority.find((c) => categories.includes(c)) ?? categories[0] ?? null;
}

const parseDate = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Minimal CSV line parser (quoted fields, "" escapes) — enough for the small
// crawl-metadata files in data/.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** handle → banner image URL from the scraped collections metadata. */
function loadCategoryImages(): Map<string, string> {
  const images = new Map<string, string>();
  let csv: string;
  try {
    csv = readFileSync(dataPath('collections.csv'), 'utf8');
  } catch {
    return images; // optional file — categories just stay imageless
  }
  const [header, ...rows] = csv.split(/\r?\n/).filter(Boolean);
  const cols = parseCsvLine(header);
  const handleIdx = cols.indexOf('handle');
  const imageIdx = cols.indexOf('image_url');
  if (handleIdx === -1 || imageIdx === -1) return images;
  for (const row of rows) {
    const fields = parseCsvLine(row);
    const handle = fields[handleIdx]?.trim();
    const url = fields[imageIdx]?.trim();
    if (handle && url) images.set(slugify(handle), url);
  }
  return images;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
async function main() {
  const raw = readFileSync(dataPath('products.json'), 'utf8');
  const products = JSON.parse(raw) as SourceProduct[];
  console.log(`Loaded ${products.length} products from ${dataPath('products.json')}`);

  // 1. Brand — the dataset is a single house under varying name strings.
  const brand = await prisma.brand.upsert({
    where: { slug: dataset.brandSlug },
    update: {},
    create: { name: dataset.brandName, slug: dataset.brandSlug, isActive: true },
  });

  // 2. Categories — one per distinct category string in the dataset, with the
  // source collection banner (when the crawl captured one) as the image.
  const categoryImages = loadCategoryImages();
  const categoryNames = [...new Set(products.flatMap((p) => p.categories ?? []))];
  const categoryIdBySlug = new Map<string, string>();
  for (const [i, name] of categoryNames.entries()) {
    const slug = slugify(name);
    const image = categoryImages.get(slug);
    const cat = await prisma.category.upsert({
      where: { slug },
      update: { name, ...(image ? { image } : {}) },
      create: { name, slug, sortOrder: i, isActive: true, image },
    });
    categoryIdBySlug.set(name, cat.id);
  }
  console.log(`Upserted brand + ${categoryNames.length} categories`);

  // 3. Synthetic reviewer cache — one user per distinct reviewer name.
  const userIdByKey = new Map<string, string>();
  async function reviewerUserId(name: string | null): Promise<string> {
    const display = (name ?? '').trim() || 'Anonymous';
    const key = slugify(display) || 'anonymous';
    const cached = userIdByKey.get(key);
    if (cached) return cached;
    const email = `${key}@reviews.elviora.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        firstName: display.slice(0, 80),
        passwordHash: 'imported',
        role: 'CUSTOMER',
      },
    });
    userIdByKey.set(key, user.id);
    return user.id;
  }

  let pCount = 0;
  let cCount = 0;
  let vCount = 0;
  let iCount = 0;
  let rCount = 0;

  for (const p of products) {
    const slug = slugify(p.handle || p.product_name);
    const categoryName = pickCategory(p.categories);
    const categoryId = categoryName ? categoryIdBySlug.get(categoryName) : undefined;
    const price = dec(p.current_price) ?? new Prisma.Decimal(0);
    const compareAt =
      p.compare_at_price && p.compare_at_price > (p.current_price ?? 0)
        ? dec(p.compare_at_price)
        : null;

    // Source publish date → createdAt, so "newest" sorting and the "New"
    // badge reflect the shop's real timeline instead of the import moment.
    const publishedAt = parseDate(p.published_at) ?? parseDate(p.created_at);

    const productData = {
      name: truncate(p.product_name, 255) ?? p.handle,
      // Sanitized before the fallback, so a description that is nothing BUT
      // source-shop boilerplate falls through to the long copy instead of
      // landing as an empty blurb.
      shortDescription: truncate(
        sanitize(p.meta_description) ?? sanitize(p.description_plain),
        500,
      ),
      fullDescription: sanitize(p.description_plain),
      price,
      comparePrice: compareAt,
      isFeatured: Boolean(p.bestseller || p.featured),
      seoTitle: truncate(sanitizeTitle(p.meta_title), 255),
      seoDescription: truncate(sanitize(p.meta_description), 500),
      brandId: brand.id,
      categoryId: categoryId ?? null,
      ...(publishedAt ? { createdAt: publishedAt } : {}),
    };

    const product = await prisma.product.upsert({
      where: { slug },
      // `isActive` is admin-managed (operators hide products from the
      // storefront) — set it on create only so re-imports never unhide.
      update: productData,
      create: {
        ...productData,
        isActive: true,
        slug,
        sku: `${dataset.skuPrefix}-P-${p.product_id}`,
      },
    });
    pCount++;

    // Full category membership — a product tagged "Kitchen Accessories|Random
    // Gadgets" must surface on BOTH category pages, which the scalar
    // categoryId can't express. Replaced each run so dropped source
    // categories don't linger.
    const memberIds = [
      ...new Set(
        (p.categories ?? [])
          .map((name) => categoryIdBySlug.get(name))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    await prisma.productCategory.deleteMany({
      where: { productId: product.id, categoryId: { notIn: memberIds } },
    });
    if (memberIds.length) {
      const res = await prisma.productCategory.createMany({
        data: memberIds.map((cid) => ({ productId: product.id, categoryId: cid })),
        skipDuplicates: true,
      });
      cCount += res.count;
    }

    // Variants — synthesize SKUs; default stock from availability.
    if (p.variants.length) {
      const res = await prisma.productVariant.createMany({
        data: p.variants.map((v) => ({
          productId: product.id,
          sku: `${dataset.skuPrefix}-V-${v.variant_id}`,
          price: dec(v.price) ?? price,
          stockQuantity: v.available ? 100 : 0,
          size: truncate(v.size, 64),
          shade: truncate(v.shade ?? v.color, 64),
          weight: v.weight ? new Prisma.Decimal(v.weight) : null,
          isActive: v.available !== false,
        })),
        skipDuplicates: true,
      });
      vCount += res.count;
    }

    // Map source variant ids → DB variant ids so images can link to the
    // variant they depict (drives the "show the selected shade" gallery).
    const dbVariants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      select: { id: true, sku: true },
    });
    const variantIdBySku = new Map(dbVariants.map((v) => [v.sku, v.id]));

    // Images — replace on each run (no FK references into product_images).
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    if (p.images.length) {
      const res = await prisma.productImage.createMany({
        data: p.images.map((img, idx) => {
          const sourceVariantId = img.variant_ids?.[0];
          const variantId = sourceVariantId
            ? (variantIdBySku.get(`${dataset.skuPrefix}-V-${sourceVariantId}`) ?? null)
            : null;
          return {
            productId: product.id,
            variantId,
            imageUrl: img.url,
            altText: truncate(img.alt_text ?? p.product_name, 255),
            isPrimary: img.image_type === 'primary' || img.position === 1,
            sortOrder: img.position ?? idx,
          };
        }),
      });
      iCount += res.count;
    }

    // Reviews — attach to a synthetic user; dedupe on (user, product).
    for (const rv of p.reviews) {
      const userId = await reviewerUserId(rv.user_name);
      const date = rv.date ? new Date(rv.date) : null;
      await prisma.review.upsert({
        where: { userId_productId: { userId, productId: product.id } },
        update: {},
        create: {
          userId,
          productId: product.id,
          rating: clampRating(rv.rating),
          title: truncate(rv.title, 200),
          comment: rv.review_text?.trim() || null,
          isVerifiedPurchase: Boolean(rv.verified_purchase),
          isApproved: true,
          ...(date && !Number.isNaN(date.getTime()) ? { createdAt: date } : {}),
        },
      });
      rCount++;
    }
  }

  // Imported variants get their stock written straight onto the column; give
  // the ledger matching opening balances so the two stay reconcilable.
  const reconciled = await reconcileStockLedger(prisma);

  console.log(
    `Imported: ${pCount} products, ${cCount} category links, ${vCount} variants, ` +
      `${iCount} images, ${rCount} reviews (across ${userIdByKey.size} synthetic reviewers), ` +
      `${reconciled} opening stock balances`,
  );
  console.log(
    'Note: products are (re)assigned to top-level categories — run ' +
      '`npm run db:seed:subcategories` to distribute them into subcategories.',
  );
}

main()
  .catch((err) => {
    console.error('[import] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
