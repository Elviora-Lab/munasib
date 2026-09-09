'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toSlug } from '@/utils/slug';

import { withAction } from '../_with-action';

import { requireAdmin } from '@/server/auth/guards';
import { cacheTags } from '@/server/cache/tags';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { adminProductsRepo } from '@/server/repositories/admin.repo';
import { inventoryService } from '@/server/services/inventory.service';
import { productsService } from '@/server/services/products.service';
import { idInput } from '@/server/validators/admin-common.schema';

const productBody = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(255).optional(),
  sku: z.string().min(2).max(80),
  shortDescription: z.string().max(500).optional(),
  fullDescription: z.string().max(8000).optional(),
  price: z.coerce.number().min(0),
  comparePrice: z.coerce.number().min(0).optional(),
  costPrice: z.coerce.number().min(0).optional(),
  isFeatured: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  // `null` clears the category (the form's "No category" option); `undefined`
  // leaves it untouched.
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  // Product-level gallery image URLs (first = primary). Uploaded via the
  // presign flow or pasted directly.
  images: z.array(z.string().url()).max(20).optional(),
});

/** Replace a product's gallery (product-level images only; variant-linked
 *  images are left untouched). First URL becomes the primary image. */
async function setProductImages(
  productId: string,
  images: string[],
  db: Prisma.TransactionClient = prisma,
) {
  await db.productImage.deleteMany({ where: { productId, variantId: null } });
  if (images.length) {
    await db.productImage.createMany({
      data: images.map((imageUrl, i) => ({
        productId,
        imageUrl,
        isPrimary: i === 0,
        sortOrder: i,
      })),
    });
  }
}

/**
 * Keep `product_categories` in step with a change to the PRIMARY category.
 *
 * A product may be merchandised in several categories (importers write the
 * full set), but this admin form edits only the primary slot. So we move just
 * that slot — drop the previous primary's membership, add the new one — and
 * leave any additional memberships alone. Rewriting the set to `{primary}`
 * here would silently unmerchandise imported products on an unrelated edit.
 */
async function syncPrimaryCategory(
  productId: string,
  previousCategoryId: string | null,
  nextCategoryId: string | null,
  db: Prisma.TransactionClient = prisma,
) {
  if (previousCategoryId === nextCategoryId) return;
  if (previousCategoryId) {
    await db.productCategory.deleteMany({ where: { productId, categoryId: previousCategoryId } });
  }
  if (nextCategoryId) {
    await db.productCategory.createMany({
      data: [{ productId, categoryId: nextCategoryId }],
      skipDuplicates: true,
    });
  }
}

export const createProduct = withAction(async (input: z.infer<typeof productBody>) => {
  await requireAdmin();
  const data = productBody.parse(input);
  // Product + gallery + default variant commit together — a failure partway
  // can't leave a half-created product (no images, not purchasable).
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: data.name,
        slug: data.slug || toSlug(data.name),
        sku: data.sku,
        shortDescription: data.shortDescription,
        fullDescription: data.fullDescription,
        price: data.price,
        comparePrice: data.comparePrice,
        costPrice: data.costPrice,
        isFeatured: data.isFeatured ?? false,
        isActive: data.isActive ?? true,
        ...(data.categoryId ? { category: { connect: { id: data.categoryId } } } : {}),
        ...(data.brandId ? { brand: { connect: { id: data.brandId } } } : {}),
      },
    });
    if (data.categoryId) await syncPrimaryCategory(created.id, null, data.categoryId, tx);
    if (data.images?.length) await setProductImages(created.id, data.images, tx);
    // A product needs at least one variant to be purchasable — start with a
    // default one mirroring the product SKU/price (stock 0 until set). Skipped
    // on a variant-SKU collision (pre-checked — a swallowed create error would
    // abort the whole transaction); the operator can add variants below.
    const variantSku = `${created.sku}-V`.slice(0, 80);
    const skuTaken = await tx.productVariant.findUnique({
      where: { sku: variantSku },
      select: { id: true },
    });
    if (!skuTaken) {
      await tx.productVariant.create({
        data: {
          productId: created.id,
          sku: variantSku,
          price: data.price,
          stockQuantity: 0,
        },
      });
    }
    return created;
  });
  // A brand-new product must appear in cached storefront lists immediately.
  await productsService.invalidateLists();
  revalidatePath('/admin/products');
  revalidatePath('/products');
  revalidatePath(`/products/${product.slug}`);
  revalidatePath('/');
  return product;
});

export const updateProduct = withAction(
  async (input: { id: string } & Partial<z.infer<typeof productBody>>) => {
    await requireAdmin();
    const { id: rawId, ...rest } = input;
    const id = z.string().uuid().parse(rawId);
    // The scalar FKs must not leak into the checked update input — Prisma
    // rejects `categoryId` alongside the nested `category` operation.
    const { images, categoryId, brandId, ...data } = productBody.partial().parse(rest);
    // Update + gallery replacement commit together — the delete-then-recreate
    // in setProductImages must never survive without the recreate.
    const product = await prisma.$transaction(async (tx) => {
      // Read the outgoing primary before the write so the membership row it
      // owns can be moved rather than orphaned.
      const previous =
        categoryId !== undefined
          ? await tx.product.findUnique({ where: { id }, select: { categoryId: true } })
          : null;
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...data,
          ...(categoryId !== undefined
            ? { category: categoryId ? { connect: { id: categoryId } } : { disconnect: true } }
            : {}),
          ...(brandId !== undefined
            ? { brand: brandId ? { connect: { id: brandId } } : { disconnect: true } }
            : {}),
        },
      });
      if (categoryId !== undefined) {
        await syncPrimaryCategory(id, previous?.categoryId ?? null, categoryId, tx);
      }
      if (images) await setProductImages(id, images, tx);
      return updated;
    });
    // Drop Next Data Cache + ISR for this PDP so price/availability edits show
    // immediately instead of waiting out the route TTL.
    await productsService.invalidate(product.slug);
    productsService.invalidateReviews(product.id, product.slug);
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    revalidatePath(`/products/${product.slug}`);
    revalidatePath('/products');
    revalidatePath('/');
    return product;
  },
);

export const deleteProduct = withAction(async (input: { id: string }) => {
  await requireAdmin();
  const { id } = idInput.parse(input);
  // delete() returns the removed row, so we still have its slug to invalidate.
  const product = await adminProductsRepo.delete(id);
  await productsService.invalidate(product.slug);
  revalidateTag(cacheTags.productReviews(product.id), 'max');
  revalidatePath('/admin/products');
  revalidatePath(`/products/${product.slug}`);
  revalidatePath('/products');
  revalidatePath('/');
  return { id: input.id };
});

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/** '' → null so clearing a size/shade field actually clears the column. */
const optionalLabel = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(64).nullable().optional(),
);

const variantBody = z.object({
  productId: z.string().uuid(),
  sku: z.string().trim().min(2).max(80),
  price: z.coerce.number().min(0),
  size: optionalLabel,
  shade: optionalLabel,
  fragrance: optionalLabel,
  stockQuantity: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().optional(),
});

export const createVariant = withAction(async (input: z.infer<typeof variantBody>) => {
  const session = await requireAdmin();
  const { productId, stockQuantity, ...data } = variantBody.parse(input);
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (!product) throw new NotFoundError('Product not found');

  const variant = await prisma.$transaction(async (tx) => {
    // Created empty, then credited through the ledger — so even a variant's
    // very first units have a movement behind them rather than appearing from
    // nowhere.
    const created = await tx.productVariant.create({
      data: { productId, ...data, stockQuantity: 0 },
    });
    if (stockQuantity > 0) {
      await inventoryService.applyDelta(
        {
          variantId: created.id,
          delta: stockQuantity,
          reason: 'OPENING_BALANCE',
          refType: 'MANUAL',
          createdBy: session.sub,
        },
        tx,
      );
    }
    return created;
  });

  await productsService.invalidate(product.slug);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${product.slug}`);
  return { id: variant.id };
});

const variantUpdateBody = variantBody.omit({ productId: true }).partial();

export const updateVariant = withAction(
  async (input: { id: string } & z.infer<typeof variantUpdateBody>) => {
    const session = await requireAdmin();
    const { id: rawId, ...rest } = input;
    const id = z.string().uuid().parse(rawId);
    const { stockQuantity, ...data } = variantUpdateBody.parse(rest);

    const variant = await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id },
        data,
        include: { product: { select: { slug: true } } },
      });
      // The form submits an absolute count; the ledger turns it into a signed
      // adjustment against the locked current value, so a sale landing
      // mid-edit is not quietly reversed.
      if (stockQuantity !== undefined) {
        await inventoryService.setLevel(
          {
            variantId: id,
            quantity: stockQuantity,
            reason: 'ADJUSTMENT',
            refType: 'MANUAL',
            createdBy: session.sub,
            note: 'Set from the admin product form',
          },
          tx,
        );
      }
      return updated;
    });

    await productsService.invalidate(variant.product.slug);
    revalidatePath(`/admin/products/${variant.productId}`);
    revalidatePath(`/products/${variant.product.slug}`);
    return { id: variant.id };
  },
);

export const deleteVariant = withAction(async (input: { id: string }) => {
  await requireAdmin();
  const id = z.string().uuid().parse(input.id);

  // Variants referenced by past orders keep the sales history readable —
  // deactivate those instead of deleting.
  const orderRefs = await prisma.orderItem.count({ where: { variantId: id } });
  if (orderRefs > 0) {
    throw new BadRequestError('This variant has order history — deactivate it instead.');
  }

  const variant = await prisma.productVariant.delete({
    where: { id },
    include: { product: { select: { slug: true } } },
  });
  await productsService.invalidate(variant.product.slug);
  revalidatePath(`/admin/products/${variant.productId}`);
  revalidatePath(`/products/${variant.product.slug}`);
  return { id };
});

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

const bulkActiveBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  isActive: z.boolean(),
});

/** Enable/disable many products at once. */
export const bulkSetProductActive = withAction(async (input: z.infer<typeof bulkActiveBody>) => {
  await requireAdmin();
  const { ids, isActive } = bulkActiveBody.parse(input);
  const count = await adminProductsRepo.bulkSetActive(ids, isActive);
  // Invalidate the affected PDP caches so storefront reflects the change.
  const slugs = await adminProductsRepo.slugsForIds(ids);
  await Promise.all(slugs.map((s) => productsService.invalidate(s.slug)));
  revalidatePath('/admin/products');
  revalidatePath('/products');
  // Bust each product's ISR page cache too, so hiding 404s immediately and
  // re-activating makes it publicly visible without waiting out the revalidate.
  for (const s of slugs) revalidatePath(`/products/${s.slug}`);
  return { count, isActive };
});

const importRow = z.object({
  name: z.string().min(2).max(255),
  price: z.coerce.number().min(0),
  sku: z.string().max(80).optional(),
  category: z.string().max(120).optional(),
  brand: z.string().max(160).optional(),
  shortDescription: z.string().max(500).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  stock: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Bulk-create/update products from parsed rows (CSV import). Matches existing
 * products by slug (derived from name): updates them, otherwise creates a new
 * product with a default sellable variant. Per-row failures are counted, not
 * fatal.
 */
export const bulkImportProducts = withAction(async (input: { rows: unknown[] }) => {
  const session = await requireAdmin();
  const rows = z.array(importRow).min(1).max(1000).parse(input.rows);

  let created = 0;
  let updated = 0;
  let failed = 0;

  // CSV files repeat the same handful of brands/categories on most rows —
  // memoize the upserted ids so each distinct value costs one query per
  // import instead of one per row.
  const brandIdBySlug = new Map<string, string>();
  const categoryIdBySlug = new Map<string, string>();

  for (const row of rows) {
    try {
      const slug = toSlug(row.name);
      if (!slug) {
        failed++;
        continue;
      }

      let brandId: string | null = null;
      if (row.brand) {
        const brandSlug = toSlug(row.brand);
        let id = brandIdBySlug.get(brandSlug);
        if (!id) {
          const b = await prisma.brand.upsert({
            where: { slug: brandSlug },
            update: {},
            create: { name: row.brand, slug: brandSlug },
          });
          id = b.id;
          brandIdBySlug.set(brandSlug, id);
        }
        brandId = id;
      }

      let categoryId: string | null = null;
      if (row.category) {
        const categorySlug = toSlug(row.category);
        let id = categoryIdBySlug.get(categorySlug);
        if (!id) {
          const c = await prisma.category.upsert({
            where: { slug: categorySlug },
            update: {},
            create: { name: row.category, slug: categorySlug },
          });
          id = c.id;
          categoryIdBySlug.set(categorySlug, id);
        }
        categoryId = id;
      }

      const common = {
        name: row.name,
        shortDescription: row.shortDescription ?? null,
        price: new Prisma.Decimal(row.price),
        isActive: row.isActive ?? true,
        brandId,
        categoryId,
      };

      const existing = await prisma.product.findUnique({
        where: { slug },
        select: { id: true, categoryId: true },
      });
      let productId: string;

      if (existing) {
        // Don't touch sku on update (avoids unique collisions).
        await prisma.product.update({ where: { id: existing.id }, data: common });
        productId = existing.id;
        await syncPrimaryCategory(productId, existing.categoryId, categoryId);
        updated++;
      } else {
        const sku = (row.sku?.trim() || `IMP-${slug}`).slice(0, 80);
        const product = await prisma.product.create({ data: { ...common, slug, sku } });
        productId = product.id;
        await syncPrimaryCategory(productId, null, categoryId);
        // A default variant so the product is immediately sellable. Its
        // starting stock is credited through the ledger rather than written
        // straight onto the column, so imported units are traceable too.
        const variant = await prisma.productVariant.create({
          data: {
            productId,
            sku: `${sku}-V`.slice(0, 80),
            price: common.price,
            stockQuantity: 0,
          },
        });
        if (row.stock) {
          await inventoryService.applyDelta({
            variantId: variant.id,
            delta: row.stock,
            reason: 'IMPORT_SYNC',
            refType: 'IMPORT',
            createdBy: session.sub,
          });
        }
        created++;
      }

      if (row.imageUrl) {
        await prisma.productImage.deleteMany({ where: { productId, isPrimary: true } });
        await prisma.productImage.create({
          data: {
            productId,
            imageUrl: row.imageUrl,
            isPrimary: true,
            sortOrder: 0,
            altText: row.name,
          },
        });
      }

      await productsService.invalidate(slug);
    } catch {
      failed++;
    }
  }

  revalidatePath('/admin/products');
  revalidatePath('/products');
  // Per-slug tags were busted in the loop; expire ISR HTML for all PDPs too.
  revalidatePath('/products/[slug]', 'page');
  return { created, updated, failed };
});

// ---------------------------------------------------------------------------
// Shopify catalog import
// ---------------------------------------------------------------------------

const shopifyVariant = z.object({
  sku: z.string().trim().max(80).optional(),
  price: z.coerce.number().min(0).max(10_000_000),
  compareAt: z.coerce.number().min(0).max(10_000_000).optional(),
  stock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  size: z.string().trim().max(64).optional(),
  shade: z.string().trim().max(64).optional(),
  fragrance: z.string().trim().max(64).optional(),
  imageUrl: z.string().url().optional(),
});

const shopifyProduct = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/i),
  title: z.string().trim().min(2).max(255),
  description: z.string().max(65_000).optional(),
  vendor: z.string().trim().max(160).optional(),
  category: z.string().trim().max(120).optional(),
  isActive: z.boolean().default(true),
  seoTitle: z.string().trim().max(255).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        position: z.number().int().min(1),
        alt: z.string().max(255).optional(),
      }),
    )
    .max(50)
    .default([]),
  variants: z.array(shopifyVariant).min(1).max(100),
});

const shopifyImportBody = z.object({
  products: z.array(shopifyProduct).min(1).max(500),
  /** Treat the file as the FULL catalog: hide store products not present in it. */
  deactivateOthers: z.boolean().default(false),
});

/** Strip HTML tags for the short description (Shopify descriptions are HTML). */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Import a Shopify product-export CSV (parsed client-side into product groups).
 *
 * Idempotent by design so re-exports can be re-imported safely:
 *  - products match by slug (the Shopify handle) — update or create
 *  - variants match by SKU — update or create; variants missing from the file
 *    are deactivated (never deleted — order history may reference them)
 *  - product-level images are replaced to mirror the file's gallery order
 *  - brand (vendor) and category are upserted by slug
 */
export const importShopifyProducts = withAction(
  async (input: z.input<typeof shopifyImportBody>) => {
    const session = await requireAdmin();
    const { products, deactivateOthers } = shopifyImportBody.parse(input);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: Array<{ handle: string; message: string }> = [];
    const importedSlugs: string[] = [];

    for (const p of products) {
      try {
        await prisma.$transaction(async (tx) => {
          const slug = toSlug(p.handle);

          let brandId: string | null = null;
          if (p.vendor) {
            const brand = await tx.brand.upsert({
              where: { slug: toSlug(p.vendor) },
              update: {},
              create: { name: p.vendor, slug: toSlug(p.vendor) },
            });
            brandId = brand.id;
          }

          let categoryId: string | null = null;
          if (p.category) {
            const catSlug = toSlug(p.category);
            if (catSlug) {
              const category = await tx.category.upsert({
                where: { slug: catSlug },
                update: {},
                create: { name: p.category, slug: catSlug },
              });
              categoryId = category.id;
            }
          }

          const minPrice = Math.min(...p.variants.map((v) => v.price));
          const compareAt = p.variants.find((v) => (v.compareAt ?? 0) > minPrice)?.compareAt;
          const description = p.description ? plainText(p.description) : null;

          const existing = await tx.product.findUnique({ where: { slug }, select: { id: true } });
          const common = {
            name: p.title,
            shortDescription: description ? description.slice(0, 500) : null,
            fullDescription: p.description ?? null,
            price: new Prisma.Decimal(minPrice),
            comparePrice: compareAt != null ? new Prisma.Decimal(compareAt) : null,
            isActive: p.isActive,
            seoTitle: p.seoTitle ?? null,
            seoDescription: p.seoDescription?.slice(0, 500) ?? null,
            brandId,
            categoryId,
          };

          let productId: string;
          if (existing) {
            const before = await tx.product.findUnique({
              where: { id: existing.id },
              select: { categoryId: true },
            });
            await tx.product.update({ where: { id: existing.id }, data: common });
            productId = existing.id;
            await syncPrimaryCategory(productId, before?.categoryId ?? null, categoryId, tx);
          } else {
            const rec = await tx.product.create({
              data: { ...common, slug, sku: (p.variants[0]?.sku || `SHP-${slug}`).slice(0, 80) },
            });
            productId = rec.id;
            await syncPrimaryCategory(productId, null, categoryId, tx);
          }

          // Variants: upsert by SKU; deactivate the ones the file no longer has.
          const fileSkus: string[] = [];
          for (const [i, v] of p.variants.entries()) {
            const sku = (v.sku || `SHP-${slug}-${i + 1}`).slice(0, 80);
            fileSkus.push(sku);
            const data = {
              productId,
              sku,
              price: new Prisma.Decimal(v.price),
              size: v.size || null,
              shade: v.shade || null,
              fragrance: v.fragrance || null,
              isActive: true,
            };
            const found = await tx.productVariant.findUnique({
              where: { sku },
              select: { id: true, productId: true },
            });
            if (found && found.productId !== productId) {
              throw new BadRequestError(`SKU ${sku} already belongs to another product`);
            }

            // The file's inventory column is an absolute count, so it goes
            // through the ledger as an adjustment against what's on hand —
            // re-importing an unchanged file writes no movement at all.
            const variantId = found
              ? (await tx.productVariant.update({ where: { id: found.id }, data })).id
              : (await tx.productVariant.create({ data: { ...data, stockQuantity: 0 } })).id;

            await inventoryService.setLevel(
              {
                variantId,
                quantity: v.stock ?? 0,
                reason: 'IMPORT_SYNC',
                refType: 'IMPORT',
                createdBy: session.sub,
                note: `Shopify import — ${sku}`,
              },
              tx,
            );
          }
          await tx.productVariant.updateMany({
            where: { productId, sku: { notIn: fileSkus } },
            data: { isActive: false },
          });

          // Product-level gallery mirrors the file (variant-linked rows kept).
          await tx.productImage.deleteMany({ where: { productId, variantId: null } });
          const gallery = [...p.images].sort((a, b) => a.position - b.position);
          if (gallery.length) {
            await tx.productImage.createMany({
              data: gallery.map((img, i) => ({
                productId,
                imageUrl: img.url,
                altText: img.alt?.slice(0, 255) || p.title,
                isPrimary: i === 0,
                sortOrder: i,
              })),
            });
          }

          // Variant-specific images (Shopify "Variant image URL") — linked so
          // the PDP can jump the gallery when that variant is selected.
          const variantImages = p.variants
            .map((v, i) => ({ url: v.imageUrl, sku: fileSkus[i] }))
            .filter((x): x is { url: string; sku: string } => Boolean(x.url && x.sku));
          for (const [i, vi] of variantImages.entries()) {
            const variant = await tx.productVariant.findUnique({
              where: { sku: vi.sku },
              select: { id: true },
            });
            if (variant) {
              await tx.productImage.create({
                data: {
                  productId,
                  variantId: variant.id,
                  imageUrl: vi.url,
                  altText: p.title,
                  isPrimary: false,
                  sortOrder: gallery.length + i,
                },
              });
            }
          }

          if (existing) updated++;
          else created++;
          importedSlugs.push(slug);
        });
        await productsService.invalidate(toSlug(p.handle));
      } catch (err) {
        failed++;
        errors.push({
          handle: p.handle,
          message: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
        });
      }
    }

    // Full-catalog mode: anything not in this file goes dark (reversible).
    let deactivated = 0;
    if (deactivateOthers && importedSlugs.length > 0) {
      const toHide = await prisma.product.findMany({
        where: { slug: { notIn: importedSlugs }, isActive: true },
        select: { slug: true },
      });
      const res = await prisma.product.updateMany({
        where: { slug: { notIn: importedSlugs }, isActive: true },
        data: { isActive: false },
      });
      deactivated = res.count;
      await Promise.all(toHide.map((p) => productsService.invalidate(p.slug)));
    }

    revalidatePath('/admin/products');
    revalidatePath('/products');
    revalidatePath('/');
    // Imported/deactivated rows already had tag busts; expire PDP ISR shells too.
    revalidatePath('/products/[slug]', 'page');
    return { created, updated, failed, deactivated, errors: errors.slice(0, 20) };
  },
);
