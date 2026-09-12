/**
 * Seed script — idempotent. Run with `npm run db:seed`.
 *
 * Builds a Pakistan-market luxury cosmetics + skincare demo catalog:
 *  • admin + demo customer (real bcrypt hashes)
 *  • 4 brands
 *  • category tree (Lips/Eyes/Face/Nails + their subcategories from the shared
 *    `CATEGORY_TREE` taxonomy · Skincare → Cleansers/Serums/… · Body)
 *  • skincare concerns vocabulary
 *  • hero ingredients
 *  • ~17 products with variants + primary/hover images + ingredient + concern mappings
 *  • initial system settings (PKR currency, PKR thresholds)
 *
 * All prices are in Pakistani Rupees. Fragrance is intentionally NOT part of
 * the house — Elviora is skincare + cosmetics only.
 *
 * Cleans up any pre-existing Fragrance category + its products from earlier
 * seed runs so the catalog stays consistent across resets.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { CATEGORY_TREE } from '../src/config/taxonomy';
import { reconcileStockLedger } from './stock-ledger';

const prisma = new PrismaClient();

const DEMO_CREDENTIALS = {
  admin: { email: 'admin@munasib.pk', password: 'Admin123!' },
  customer: { email: 'demo@munasib.pk', password: 'Demo123!' },
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

async function upsertCategory(input: {
  name: string;
  slug: string;
  parentSlug?: string;
  sortOrder?: number;
  description?: string;
}) {
  let parentId: string | undefined;
  if (input.parentSlug) {
    const parent = await prisma.category.findUnique({ where: { slug: input.parentSlug } });
    parentId = parent?.id;
  }
  return prisma.category.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      parentId,
      sortOrder: input.sortOrder ?? 0,
      description: input.description,
    },
    create: {
      name: input.name,
      slug: input.slug,
      parentId,
      sortOrder: input.sortOrder ?? 0,
      description: input.description,
    },
  });
}

async function upsertConcern(name: string, slug: string) {
  return prisma.skinConcern.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });
}

async function upsertIngredient(name: string, slug: string, description: string) {
  return prisma.ingredient.upsert({
    where: { slug },
    update: { description },
    create: { name, slug, description },
  });
}

async function upsertBrand(name: string, slug: string, description: string) {
  return prisma.brand.upsert({
    where: { slug },
    update: { description },
    create: { name, slug, description },
  });
}

type ProductSeed = {
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  price: number;
  comparePrice?: number;
  brandSlug: string;
  categorySlug: string;
  isFeatured?: boolean;
  images: string[]; // primary first
  variants: Array<{
    sku: string;
    size?: string;
    shade?: string;
    fragrance?: string;
    price: number;
    stockQuantity: number;
  }>;
  ingredientSlugs?: string[];
  concernSlugs?: string[];
};

async function upsertProduct(seed: ProductSeed) {
  const brand = await prisma.brand.findUnique({ where: { slug: seed.brandSlug } });
  const category = await prisma.category.findUnique({ where: { slug: seed.categorySlug } });

  const product = await prisma.product.upsert({
    where: { slug: seed.slug },
    update: {
      name: seed.name,
      shortDescription: seed.shortDescription,
      fullDescription: seed.fullDescription,
      price: seed.price,
      comparePrice: seed.comparePrice,
      isFeatured: seed.isFeatured ?? false,
      brandId: brand?.id,
      categoryId: category?.id,
    },
    create: {
      slug: seed.slug,
      sku: seed.sku,
      name: seed.name,
      shortDescription: seed.shortDescription,
      fullDescription: seed.fullDescription,
      price: seed.price,
      comparePrice: seed.comparePrice,
      isFeatured: seed.isFeatured ?? false,
      brandId: brand?.id,
      categoryId: category?.id,
    },
  });

  // Variants
  for (const v of seed.variants) {
    await prisma.productVariant.upsert({
      where: { sku: v.sku },
      update: {
        size: v.size,
        shade: v.shade,
        fragrance: v.fragrance,
        price: v.price,
        stockQuantity: v.stockQuantity,
      },
      create: {
        productId: product.id,
        sku: v.sku,
        size: v.size,
        shade: v.shade,
        fragrance: v.fragrance,
        price: v.price,
        stockQuantity: v.stockQuantity,
      },
    });
  }

  // Images — replace any existing set so the seed is deterministic.
  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  await prisma.productImage.createMany({
    data: seed.images.map((url, i) => ({
      productId: product.id,
      imageUrl: url,
      altText: `${seed.name} — ${i === 0 ? 'primary' : `gallery ${i + 1}`}`,
      isPrimary: i === 0,
      sortOrder: i,
    })),
  });

  // Ingredient + concern mappings
  if (seed.ingredientSlugs?.length) {
    const ingredients = await prisma.ingredient.findMany({
      where: { slug: { in: seed.ingredientSlugs } },
    });
    for (const ing of ingredients) {
      await prisma.productIngredient.upsert({
        where: { productId_ingredientId: { productId: product.id, ingredientId: ing.id } },
        update: {},
        create: { productId: product.id, ingredientId: ing.id },
      });
    }
  }
  if (seed.concernSlugs?.length) {
    const concerns = await prisma.skinConcern.findMany({
      where: { slug: { in: seed.concernSlugs } },
    });
    for (const c of concerns) {
      await prisma.productSkinConcern.upsert({
        where: { productId_skinConcernId: { productId: product.id, skinConcernId: c.id } },
        update: {},
        create: { productId: product.id, skinConcernId: c.id },
      });
    }
  }

  return product;
}

// ---------------------------------------------------------------
// Data
// ---------------------------------------------------------------

// Editorial Unsplash imagery — all under the Unsplash license (free commercial use).
const IMG = {
  serum1:
    'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1200&q=80',
  serum2:
    'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80',
  serum3:
    'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1200&q=80',
  cleanser:
    'https://images.unsplash.com/photo-1570194065650-d99fb4bedf0a?auto=format&fit=crop&w=1200&q=80',
  cream:
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=1200&q=80',
  sunscreen:
    'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=1200&q=80',
  mask: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1200&q=80',
  lipstick:
    'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=1200&q=80',
  lipstick2:
    'https://images.unsplash.com/photo-1599733589046-9a2b1c2f8d8a?auto=format&fit=crop&w=1200&q=80',
  liplacquer:
    'https://images.unsplash.com/photo-1631214540242-3cd8c4b0ba98?auto=format&fit=crop&w=1200&q=80',
  lipbalm:
    'https://images.unsplash.com/photo-1631730486572-226d1f595b68?auto=format&fit=crop&w=1200&q=80',
  mascara:
    'https://images.unsplash.com/photo-1631214540242-3cd8c4b0ba98?auto=format&fit=crop&w=1200&q=80',
  eyeliner:
    'https://images.unsplash.com/photo-1583241800698-9c3a8c83b5ad?auto=format&fit=crop&w=1200&q=80',
  palette:
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=80',
  foundation:
    'https://images.unsplash.com/photo-1631730359585-a04bf76b3afb?auto=format&fit=crop&w=1200&q=80',
  blush:
    'https://images.unsplash.com/photo-1522335789203-aaa2c4c80a90?auto=format&fit=crop&w=1200&q=80',
  highlighter:
    'https://images.unsplash.com/photo-1631214540242-3cd8c4b0ba98?auto=format&fit=crop&w=1200&q=80',
  nail: 'https://images.unsplash.com/photo-1601612628452-9e99ced43524?auto=format&fit=crop&w=1200&q=80',
  fragrance:
    'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80',
  fragrance2:
    'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1200&q=80',
  bodyoil:
    'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1200&q=80',
};

const PRODUCTS: ProductSeed[] = [
  // ---------------- SKINCARE → Serums ----------------
  {
    slug: 'lumiere-vitamin-c-serum',
    sku: 'ELV-SER-VC-001',
    name: 'Lumière Vitamin C Serum',
    brandSlug: 'elviora',
    categorySlug: 'serums',
    shortDescription: 'Editorial-grade brightening serum with 15% stabilized Vitamin C.',
    fullDescription:
      'A daily ritual that revives radiance — 15% L-Ascorbic Acid, ferulic acid, and bakuchiol in a silken, fast-absorbing emulsion. Use AM under sunscreen.',
    price: 23500,
    comparePrice: 28900,
    isFeatured: true,
    images: [IMG.serum1, IMG.serum2],
    variants: [
      { sku: 'ELV-SER-VC-001-30', size: '30ml', price: 23500, stockQuantity: 120 },
      { sku: 'ELV-SER-VC-001-50', size: '50ml', price: 33900, stockQuantity: 80 },
    ],
    ingredientSlugs: ['vitamin-c', 'bakuchiol'],
    concernSlugs: ['brightening', 'anti-aging', 'hyperpigmentation'],
  },
  {
    slug: 'hydra-veil-hyaluronic-serum',
    sku: 'ELV-SER-HA-002',
    name: 'Hydra-Veil Hyaluronic Serum',
    brandSlug: 'elviora',
    categorySlug: 'serums',
    shortDescription: 'Five-weight hyaluronic acid complex for plush, dewy skin.',
    fullDescription:
      'Marine-derived hyaluronic acid in five molecular weights delivers hydration from surface to deeper layers. Layer under any cream.',
    price: 18900,
    isFeatured: true,
    images: [IMG.serum2, IMG.serum1],
    variants: [
      { sku: 'ELV-SER-HA-002-30', size: '30ml', price: 18900, stockQuantity: 95 },
      { sku: 'ELV-SER-HA-002-50', size: '50ml', price: 28500, stockQuantity: 60 },
    ],
    ingredientSlugs: ['hyaluronic-acid', 'niacinamide'],
    concernSlugs: ['hydration', 'sensitivity'],
  },
  {
    slug: 'renew-retinol-night-serum',
    sku: 'ELV-SER-RT-003',
    name: 'Renew 0.3% Retinol Night Serum',
    brandSlug: 'elviora',
    categorySlug: 'serums',
    shortDescription:
      'Encapsulated retinol with squalane buffer — clinical results, gentle finish.',
    fullDescription:
      'Time-release encapsulated retinol at 0.3% paired with squalane and centella for a smoother retexturing experience. Begin 2–3 nights a week.',
    price: 25500,
    images: [IMG.serum3, IMG.serum1],
    variants: [{ sku: 'ELV-SER-RT-003-30', size: '30ml', price: 25500, stockQuantity: 70 }],
    ingredientSlugs: ['retinol'],
    concernSlugs: ['anti-aging', 'pores-texture'],
  },

  // ---------------- SKINCARE → Cleansers ----------------
  {
    slug: 'velloute-cream-cleanser',
    sku: 'ELV-CLN-CR-004',
    name: 'Velouté Cream Cleanser',
    brandSlug: 'elviora',
    categorySlug: 'cleansers',
    shortDescription: 'A silken milk cleanser that dissolves makeup and respects the barrier.',
    fullDescription:
      'Sweet-almond milk and pre-biotic oat lipids dissolve sunscreen and mascara without stripping. Massage onto dry skin, emulsify with water.',
    price: 9900,
    images: [IMG.cleanser],
    variants: [{ sku: 'ELV-CLN-CR-004-150', size: '150ml', price: 9900, stockQuantity: 140 }],
    concernSlugs: ['sensitivity', 'hydration'],
  },

  // ---------------- SKINCARE → Moisturizers ----------------
  {
    slug: 'couture-bakuchiol-cream',
    sku: 'ELV-MST-BC-005',
    name: 'Couture Bakuchiol Moisturizer',
    brandSlug: 'atelier-maison',
    categorySlug: 'moisturizers',
    shortDescription: 'Plant-based retinol alternative in a weightless cream.',
    fullDescription:
      'Bakuchiol, ceramides and rose oil in a feather-light cream. Suitable for sensitive, pregnant and post-procedure skin.',
    price: 20500,
    isFeatured: true,
    images: [IMG.cream],
    variants: [{ sku: 'ELV-MST-BC-005-50', size: '50ml', price: 20500, stockQuantity: 90 }],
    ingredientSlugs: ['bakuchiol'],
    concernSlugs: ['anti-aging', 'sensitivity'],
  },

  // ---------------- SKINCARE → Sunscreens ----------------
  {
    slug: 'silk-drop-spf-50',
    sku: 'ELV-SUN-SD-006',
    name: 'Silk Drop SPF 50',
    brandSlug: 'elviora',
    categorySlug: 'sunscreens',
    shortDescription: 'Invisible, fluid SPF 50 PA++++ — primes makeup, protects skin.',
    fullDescription:
      'A truly invisible chemical-mineral hybrid sunscreen with broad-spectrum SPF 50. No white cast, no pilling. Reapply every two hours.',
    price: 13800,
    images: [IMG.sunscreen],
    variants: [{ sku: 'ELV-SUN-SD-006-50', size: '50ml', price: 13800, stockQuantity: 200 }],
    concernSlugs: ['anti-aging', 'hyperpigmentation'],
  },

  // ---------------- SKINCARE → Masks ----------------
  {
    slug: 'nuit-sleep-mask',
    sku: 'ELV-MSK-NM-007',
    name: 'Nuit Sleep Mask',
    brandSlug: 'studio-naturelle',
    categorySlug: 'masks',
    shortDescription: 'Overnight ceramide mask — wake to softer, lit-from-within skin.',
    fullDescription:
      'A gel-cream overnight mask with ceramides, panthenol and a touch of poppy extract. Apply as the last step of your evening ritual.',
    price: 16800,
    images: [IMG.mask],
    variants: [{ sku: 'ELV-MSK-NM-007-75', size: '75ml', price: 16800, stockQuantity: 75 }],
    concernSlugs: ['hydration', 'anti-aging'],
  },

  // ---------------- MAKEUP → Lip ----------------
  {
    slug: 'velvet-matte-lipstick',
    sku: 'ELV-LIP-VM-008',
    name: 'Velvet Matte Lipstick',
    brandSlug: 'maison-lumiere',
    categorySlug: 'lipstick',
    shortDescription: 'Eight-hour velvet matte that wears like a stain.',
    fullDescription:
      'A bullet lipstick with cushioned jojoba esters and saturated, weightless colour. Six house shades, all buildable.',
    price: 8500,
    isFeatured: true,
    images: [IMG.lipstick, IMG.lipstick2],
    variants: [
      { sku: 'ELV-LIP-VM-008-NOIR', shade: 'Noir Brûlé', price: 8500, stockQuantity: 60 },
      { sku: 'ELV-LIP-VM-008-ROSE', shade: 'Rose Atelier', price: 8500, stockQuantity: 75 },
      { sku: 'ELV-LIP-VM-008-RED', shade: 'Rouge Couture', price: 8500, stockQuantity: 90 },
      { sku: 'ELV-LIP-VM-008-NUDE', shade: 'Nu Champagne', price: 8500, stockQuantity: 110 },
      { sku: 'ELV-LIP-VM-008-PLUM', shade: 'Plum Velour', price: 8500, stockQuantity: 45 },
      { sku: 'ELV-LIP-VM-008-MAUVE', shade: 'Mauve Studio', price: 8500, stockQuantity: 55 },
    ],
  },
  {
    slug: 'liquid-lip-lacquer',
    sku: 'ELV-LIP-LL-009',
    name: 'Liquid Lip Lacquer',
    brandSlug: 'maison-lumiere',
    categorySlug: 'liquid-lipstick',
    shortDescription: 'High-shine liquid lacquer — colour with a wet-look finish.',
    fullDescription:
      'A featherweight liquid lipstick with a glassy, dimensional finish. Glides on, sets to a comfortable second-skin film.',
    price: 7500,
    images: [IMG.liplacquer],
    variants: [
      { sku: 'ELV-LIP-LL-009-CORAL', shade: 'Coral Lumière', price: 7500, stockQuantity: 80 },
      { sku: 'ELV-LIP-LL-009-WINE', shade: 'Vin Vieux', price: 7500, stockQuantity: 60 },
      { sku: 'ELV-LIP-LL-009-PINK', shade: 'Pink Cordée', price: 7500, stockQuantity: 70 },
      { sku: 'ELV-LIP-LL-009-BERRY', shade: 'Berry Editoriale', price: 7500, stockQuantity: 50 },
    ],
  },
  {
    slug: 'sheer-tint-lip-balm',
    sku: 'ELV-LIP-TB-010',
    name: 'Sheer Tint Lip Balm',
    brandSlug: 'studio-naturelle',
    categorySlug: 'lips',
    shortDescription: 'Tinted balm with shea butter and a hint of editorial colour.',
    fullDescription:
      'Whipped shea and cupuaçu butter with a sheer wash of pigment. The everyday lip you reach for blind.',
    price: 5800,
    images: [IMG.lipbalm],
    variants: [
      { sku: 'ELV-LIP-TB-010-PETAL', shade: 'Petale', price: 5800, stockQuantity: 130 },
      { sku: 'ELV-LIP-TB-010-PEACH', shade: 'Peach Lumière', price: 5800, stockQuantity: 100 },
      { sku: 'ELV-LIP-TB-010-RUBY', shade: 'Ruby Tender', price: 5800, stockQuantity: 85 },
    ],
  },

  // ---------------- MAKEUP → Eye ----------------
  {
    slug: 'couture-volume-mascara',
    sku: 'ELV-EYE-MS-011',
    name: 'Couture Volume Mascara',
    brandSlug: 'maison-lumiere',
    categorySlug: 'mascara',
    shortDescription: 'A buildable volumising mascara — no clumps, no flakes.',
    fullDescription:
      'A polymer brush, deeply pigmented black formula and a 16-hour wear. Builds from natural to sculpted in three coats.',
    price: 7900,
    images: [IMG.mascara],
    variants: [
      { sku: 'ELV-EYE-MS-011-NOIR', shade: 'Noir Profond', price: 7900, stockQuantity: 150 },
      { sku: 'ELV-EYE-MS-011-BRUN', shade: 'Brun Editorial', price: 7900, stockQuantity: 80 },
    ],
  },
  {
    slug: 'liquid-eyeliner-precision',
    sku: 'ELV-EYE-LE-012',
    name: 'Precision Liquid Eyeliner',
    brandSlug: 'maison-lumiere',
    categorySlug: 'eyeliner',
    shortDescription: 'Felt-tip precision, intense pigment, all-day wear.',
    fullDescription:
      'A flexible felt tip lays down a sharp graphic line or a soft tightline. Smudge-proof for hours.',
    price: 6800,
    images: [IMG.eyeliner],
    variants: [{ sku: 'ELV-EYE-LE-012-NOIR', shade: 'Noir', price: 6800, stockQuantity: 110 }],
  },
  {
    slug: 'editorial-nine-pan-palette',
    sku: 'ELV-EYE-PL-013',
    name: 'Editorial Nine-Pan Palette',
    brandSlug: 'maison-lumiere',
    categorySlug: 'eyeshadow',
    shortDescription: 'Nine couture shadows, hand-pressed in small batches.',
    fullDescription:
      'Three mattes, three satins, three foiled — curated for an entire wardrobe of looks in one editorial case.',
    price: 16800,
    images: [IMG.palette],
    variants: [
      { sku: 'ELV-EYE-PL-013-WARM', shade: 'Atelier Warm', price: 16800, stockQuantity: 40 },
      { sku: 'ELV-EYE-PL-013-COOL', shade: 'Studio Cool', price: 16800, stockQuantity: 35 },
    ],
  },

  // ---------------- MAKEUP → Face ----------------
  {
    slug: 'silk-veil-foundation',
    sku: 'ELV-FCE-FD-014',
    name: 'Silk Veil Foundation',
    brandSlug: 'maison-lumiere',
    categorySlug: 'foundation',
    shortDescription: 'A skin-like satin foundation in eight house shades.',
    fullDescription:
      'A buildable medium-coverage foundation that finishes like a second skin. Eight shades that span warm, cool and neutral undertones.',
    price: 14800,
    isFeatured: true,
    images: [IMG.foundation],
    variants: [
      { sku: 'ELV-FCE-FD-014-01', shade: '01 Ivoire', price: 14800, stockQuantity: 60 },
      { sku: 'ELV-FCE-FD-014-02', shade: '02 Albâtre', price: 14800, stockQuantity: 70 },
      { sku: 'ELV-FCE-FD-014-03', shade: '03 Sable', price: 14800, stockQuantity: 65 },
      { sku: 'ELV-FCE-FD-014-04', shade: '04 Beige Doré', price: 14800, stockQuantity: 50 },
      { sku: 'ELV-FCE-FD-014-05', shade: '05 Caramel', price: 14800, stockQuantity: 45 },
      { sku: 'ELV-FCE-FD-014-06', shade: '06 Bronze', price: 14800, stockQuantity: 40 },
      { sku: 'ELV-FCE-FD-014-07', shade: '07 Acajou', price: 14800, stockQuantity: 30 },
      { sku: 'ELV-FCE-FD-014-08', shade: '08 Ébène', price: 14800, stockQuantity: 25 },
    ],
  },
  {
    slug: 'powder-blush-soft',
    sku: 'ELV-FCE-BL-015',
    name: 'Soft Sculpt Powder Blush',
    brandSlug: 'maison-lumiere',
    categorySlug: 'blush',
    shortDescription: 'Silky, talc-free blush in three editorial shades.',
    fullDescription:
      'Finely milled, talc-free pigment with a soft-focus finish. Wear sheer for a flush, layer for sculpt.',
    price: 9500,
    images: [IMG.blush],
    variants: [
      { sku: 'ELV-FCE-BL-015-PETAL', shade: 'Pétale', price: 9500, stockQuantity: 70 },
      { sku: 'ELV-FCE-BL-015-TERRA', shade: 'Terracotta', price: 9500, stockQuantity: 55 },
      { sku: 'ELV-FCE-BL-015-ROSE', shade: 'Rose Lumière', price: 9500, stockQuantity: 65 },
    ],
  },
  {
    slug: 'champagne-highlighter',
    sku: 'ELV-FCE-HL-016',
    name: 'Champagne Highlighter',
    brandSlug: 'maison-lumiere',
    categorySlug: 'highlighter-contour',
    shortDescription: 'A wet-look highlighter — strobe or veil, never glittery.',
    fullDescription:
      'Liquid-pressed champagne pearls deliver a wet-look glow. Tap onto cheekbones, brow bones and cupid’s bow.',
    price: 9900,
    images: [IMG.highlighter],
    variants: [
      { sku: 'ELV-FCE-HL-016-CHAMP', shade: 'Champagne', price: 9900, stockQuantity: 90 },
      { sku: 'ELV-FCE-HL-016-PEARL', shade: 'Pearl Ivory', price: 9900, stockQuantity: 70 },
    ],
  },

  // ---------------- MAKEUP → Nail ----------------
  {
    slug: 'salon-lacquer-nail-polish',
    sku: 'ELV-NL-LQ-017',
    name: 'Salon Lacquer Nail Polish',
    brandSlug: 'maison-lumiere',
    categorySlug: 'nail-polish',
    shortDescription: 'Long-wear lacquer with a glassy salon finish.',
    fullDescription:
      'A 14-free formula, plant-based plasticizer, and a flat brush for streak-free application. Lasts 7+ days with base + top.',
    price: 4800,
    images: [IMG.nail],
    variants: [
      { sku: 'ELV-NL-LQ-017-NOIR', shade: 'Noir Atelier', price: 4800, stockQuantity: 95 },
      { sku: 'ELV-NL-LQ-017-RED', shade: 'Rouge Studio', price: 4800, stockQuantity: 110 },
      { sku: 'ELV-NL-LQ-017-NUDE', shade: 'Nu Editorial', price: 4800, stockQuantity: 130 },
      { sku: 'ELV-NL-LQ-017-PLUM', shade: 'Plum Sombre', price: 4800, stockQuantity: 60 },
      { sku: 'ELV-NL-LQ-017-PEARL', shade: 'Pearl Maison', price: 4800, stockQuantity: 75 },
    ],
  },
];

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------

async function main() {
  // — Legacy cleanup: previous seed runs created a Fragrance category +
  //   "Lumière Eau de Parfum" product. The house is now skincare + cosmetics
  //   only; remove any straggler rows so the catalog stays consistent.
  await prisma.product.deleteMany({
    where: { OR: [{ slug: 'lumiere-eau-de-parfum' }, { category: { slug: 'fragrance' } }] },
  });
  await prisma.category.deleteMany({ where: { slug: 'fragrance' } });

  // — Users
  const adminHash = await bcrypt.hash(DEMO_CREDENTIALS.admin.password, 12);
  await prisma.user.upsert({
    where: { email: DEMO_CREDENTIALS.admin.email },
    update: { role: 'SUPER_ADMIN', passwordHash: adminHash, isVerified: true },
    create: {
      email: DEMO_CREDENTIALS.admin.email,
      firstName: 'Munasib',
      lastName: 'Concierge',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      isVerified: true,
    },
  });
  await prisma.adminUser.upsert({
    where: { email: DEMO_CREDENTIALS.admin.email },
    update: { passwordHash: adminHash, isActive: true },
    create: {
      name: 'Munasib Concierge',
      email: DEMO_CREDENTIALS.admin.email,
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  const customerHash = await bcrypt.hash(DEMO_CREDENTIALS.customer.password, 12);
  await prisma.user.upsert({
    where: { email: DEMO_CREDENTIALS.customer.email },
    update: { passwordHash: customerHash, isVerified: true },
    create: {
      firstName: 'Demo',
      lastName: 'Customer',
      email: DEMO_CREDENTIALS.customer.email,
      passwordHash: customerHash,
      role: 'CUSTOMER',
      isVerified: true,
    },
  });

  // — Brands
  await Promise.all([
    upsertBrand('Elviora', 'elviora', 'The house — quietly powerful skincare and cosmetics.'),
    upsertBrand(
      'Maison Lumière',
      'maison-lumiere',
      'Our editorial colour atelier — lips, eyes, cheeks.',
    ),
    upsertBrand(
      'Atelier Maison',
      'atelier-maison',
      'Couture skincare for the post-procedure shelf.',
    ),
    upsertBrand(
      'Studio Naturelle',
      'studio-naturelle',
      'Clean-beauty essentials, formulated minimally.',
    ),
  ]);

  // — Categories (parents first, then children)
  // Makeup taxonomy — the same tree the header/mega-menu is built from, so
  // seeded slugs always match the storefront links.
  for (const [index, cat] of CATEGORY_TREE.entries()) {
    await upsertCategory({
      name: cat.name,
      slug: cat.slug,
      sortOrder: index + 1,
      description: cat.description,
    });
    for (const sub of cat.children) {
      await upsertCategory({
        name: sub.name,
        slug: sub.slug,
        parentSlug: cat.slug,
        sortOrder: sub.sortOrder,
        description: sub.description,
      });
    }
  }
  await upsertCategory({ name: 'Skincare', slug: 'skincare', sortOrder: 5 });
  await upsertCategory({ name: 'Body', slug: 'body', sortOrder: 6 });

  await upsertCategory({
    name: 'Cleansers',
    slug: 'cleansers',
    parentSlug: 'skincare',
    sortOrder: 1,
  });
  await upsertCategory({ name: 'Serums', slug: 'serums', parentSlug: 'skincare', sortOrder: 2 });
  await upsertCategory({
    name: 'Moisturizers',
    slug: 'moisturizers',
    parentSlug: 'skincare',
    sortOrder: 3,
  });
  await upsertCategory({
    name: 'Sunscreens',
    slug: 'sunscreens',
    parentSlug: 'skincare',
    sortOrder: 4,
  });
  await upsertCategory({ name: 'Masks', slug: 'masks', parentSlug: 'skincare', sortOrder: 5 });

  // — Skincare concerns
  const concerns: Array<[string, string]> = [
    ['Hydration', 'hydration'],
    ['Anti-Aging', 'anti-aging'],
    ['Brightening', 'brightening'],
    ['Acne & Blemishes', 'acne-blemishes'],
    ['Sensitivity', 'sensitivity'],
    ['Hyperpigmentation', 'hyperpigmentation'],
    ['Pores & Texture', 'pores-texture'],
  ];
  for (const [name, slug] of concerns) await upsertConcern(name, slug);

  // — Hero ingredients
  const ingredients: Array<[string, string, string]> = [
    ['Niacinamide', 'niacinamide', 'Vitamin B3 — refines pores, evens tone.'],
    ['Hyaluronic Acid', 'hyaluronic-acid', 'Humectant — holds 1000x its weight in water.'],
    ['Retinol', 'retinol', 'Vitamin A — accelerates cell turnover.'],
    ['Vitamin C', 'vitamin-c', 'Antioxidant — brightens and protects.'],
    ['Bakuchiol', 'bakuchiol', 'Plant-based retinol alternative.'],
  ];
  for (const [name, slug, description] of ingredients)
    await upsertIngredient(name, slug, description);

  // — Products
  for (const seed of PRODUCTS) {
    await upsertProduct(seed);
  }

  // — System settings (PKR-denominated)
  const settings: Array<[string, object]> = [
    ['site.currency.default', { value: 'PKR' }],
    // Complimentary shipping over PKR 15,000.
    ['shipping.free_threshold', { value: 15000 }],
    // 1 loyalty point per PKR 100 spent.
    ['loyalty.points_per_unit', { value: 1, per: 100, currency: 'PKR' }],
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // Seeded variants get their stock written straight onto the column, so give
  // the ledger its opening balances — otherwise every fresh database reports
  // drift the moment it starts.
  const reconciled = await reconcileStockLedger(prisma);

  console.log(
    `Seed complete: ${PRODUCTS.length} products across 4 brands, ${reconciled} opening stock balances.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
