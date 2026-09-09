'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toSlug } from '@/utils/slug';

import { withAction } from '../_with-action';

import { requireAbility } from '@/server/auth/guards';
import { NotFoundError } from '@/server/http/errors';
import { productsService } from '@/server/services/products.service';
import { purchasingService } from '@/server/services/purchasing.service';

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

const supplierBody = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().max(180).optional(),
  contactName: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(2000).optional(),
  paymentTerms: z.string().trim().max(64).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.coerce.boolean().optional(),
});

const blankToNull = (value?: string) => (value && value.length > 0 ? value : null);

export const createSupplier = withAction(async (input: z.input<typeof supplierBody>) => {
  await requireAbility('suppliers:write');
  const data = supplierBody.parse(input);

  const supplier = await prisma.supplier.create({
    data: {
      name: data.name,
      slug: toSlug(data.slug || data.name),
      contactName: blankToNull(data.contactName),
      email: blankToNull(data.email),
      phone: blankToNull(data.phone),
      address: blankToNull(data.address),
      paymentTerms: blankToNull(data.paymentTerms),
      leadTimeDays: data.leadTimeDays ?? null,
      notes: blankToNull(data.notes),
      isActive: data.isActive ?? true,
    },
  });

  revalidatePath('/admin/suppliers');
  return { id: supplier.id };
});

export const updateSupplier = withAction(
  async (input: { id: string } & Partial<z.input<typeof supplierBody>>) => {
    await requireAbility('suppliers:write');
    const { id: rawId, ...rest } = input;
    const id = z.string().uuid().parse(rawId);
    const data = supplierBody.partial().parse(rest);

    await prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        slug: data.slug ? toSlug(data.slug) : undefined,
        email: data.email === undefined ? undefined : blankToNull(data.email),
      },
    });

    revalidatePath('/admin/suppliers');
    revalidatePath(`/admin/suppliers/${id}`);
    return { id };
  },
);

const supplierVariantBody = z
  .object({
    supplierId: z.string().uuid(),
    /** Either the id, or our own SKU — the admin form works from the SKU. */
    variantId: z.string().uuid().optional(),
    ourSku: z.string().trim().max(80).optional(),
    supplierSku: z.string().trim().max(80).optional(),
    unitCost: z.coerce.number().min(0).optional(),
    minOrderQuantity: z.coerce.number().int().min(1).optional(),
    isPreferred: z.coerce.boolean().optional(),
  })
  .refine((body) => body.variantId || body.ourSku, {
    message: 'Provide a variant SKU',
    path: ['ourSku'],
  });

/** Record what a supplier charges for a variant, under their own SKU. */
export const linkSupplierVariant = withAction(
  async (input: z.input<typeof supplierVariantBody>) => {
    await requireAbility('suppliers:write');
    const parsed = supplierVariantBody.parse(input);

    const variantId = parsed.variantId ?? (await resolveVariantId(parsed.ourSku ?? ''));
    const data = { ...parsed, variantId };

    await prisma.$transaction(async (tx) => {
      // A partial unique index allows only one preferred row per variant, so
      // stand the previous one down before claiming the flag.
      if (data.isPreferred) {
        await tx.supplierVariant.updateMany({
          where: { variantId: data.variantId, isPreferred: true },
          data: { isPreferred: false },
        });
      }

      await tx.supplierVariant.upsert({
        where: {
          supplierId_variantId: { supplierId: data.supplierId, variantId: data.variantId },
        },
        update: {
          supplierSku: blankToNull(data.supplierSku),
          unitCost: data.unitCost ?? null,
          minOrderQuantity: data.minOrderQuantity ?? null,
          isPreferred: data.isPreferred ?? false,
        },
        create: {
          supplierId: data.supplierId,
          variantId: data.variantId,
          supplierSku: blankToNull(data.supplierSku),
          unitCost: data.unitCost ?? null,
          minOrderQuantity: data.minOrderQuantity ?? null,
          isPreferred: data.isPreferred ?? false,
        },
      });
    });

    revalidatePath(`/admin/suppliers/${data.supplierId}`);
    return { supplierId: data.supplierId };
  },
);

async function resolveVariantId(sku: string): Promise<string> {
  const variant = await prisma.productVariant.findUnique({
    where: { sku },
    select: { id: true },
  });
  if (!variant) throw new NotFoundError(`No variant with SKU ${sku}`);
  return variant.id;
}

export const unlinkSupplierVariant = withAction(async (input: { id: string }) => {
  await requireAbility('suppliers:write');
  const id = z.string().uuid().parse(input.id);

  const row = await prisma.supplierVariant.delete({ where: { id } }).catch(() => null);
  if (!row) throw new NotFoundError('That supplier price is already gone');

  revalidatePath(`/admin/suppliers/${row.supplierId}`);
  return { id };
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

const lineBody = z
  .object({
    variantId: z.string().uuid().optional(),
    /** The admin form works from our SKU; the id path is for programmatic use. */
    ourSku: z.string().trim().max(80).optional(),
    quantityOrdered: z.coerce.number().int().min(1).max(1_000_000),
    unitCost: z.coerce.number().min(0),
  })
  .refine((line) => line.variantId || line.ourSku, {
    message: 'Provide a variant SKU',
    path: ['ourSku'],
  });

async function resolveLines(lines: z.infer<typeof lineBody>[]) {
  return Promise.all(
    lines.map(async (line) => ({
      variantId: line.variantId ?? (await resolveVariantId(line.ourSku ?? '')),
      quantityOrdered: line.quantityOrdered,
      unitCost: line.unitCost,
    })),
  );
}

/**
 * What a supplier last quoted for one of our SKUs, so the order form can
 * prefill instead of relying on someone's memory. Also reports stock on hand
 * and the suggested order size.
 */
export const lookupSupplierPrice = withAction(
  async (input: { supplierId: string; ourSku: string }) => {
    await requireAbility('purchasing:read');
    const supplierId = z.string().uuid().parse(input.supplierId);
    const sku = z.string().trim().min(1).max(80).parse(input.ourSku);

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      select: {
        id: true,
        stockQuantity: true,
        reorderQuantity: true,
        avgCost: true,
        product: { select: { name: true } },
        supplierLinks: {
          where: { supplierId },
          select: { unitCost: true, minOrderQuantity: true, supplierSku: true },
        },
      },
    });
    if (!variant) throw new NotFoundError(`No variant with SKU ${sku}`);

    const link = variant.supplierLinks[0];
    return {
      variantId: variant.id,
      productName: variant.product.name,
      stockQuantity: variant.stockQuantity,
      suggestedQuantity: variant.reorderQuantity ?? link?.minOrderQuantity ?? null,
      unitCost: link?.unitCost
        ? Number(link.unitCost)
        : variant.avgCost
          ? Number(variant.avgCost)
          : null,
      supplierSku: link?.supplierSku ?? null,
    };
  },
);

const draftBody = z.object({
  supplierId: z.string().uuid(),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
  shippingCost: z.coerce.number().min(0).optional(),
  dutyCost: z.coerce.number().min(0).optional(),
  otherCost: z.coerce.number().min(0).optional(),
  items: z.array(lineBody).min(1).max(200),
});

export const createPurchaseOrder = withAction(async (input: z.input<typeof draftBody>) => {
  const session = await requireAbility('purchasing:write');
  const data = draftBody.parse(input);

  const po = await purchasingService.createDraft({
    ...data,
    items: await resolveLines(data.items),
    createdBy: session.sub,
  });

  revalidatePath('/admin/purchasing');
  return { id: po.id, poNumber: po.poNumber };
});

const updateDraftBody = draftBody.omit({ supplierId: true }).partial();

export const updatePurchaseOrder = withAction(
  async (input: { id: string } & z.input<typeof updateDraftBody>) => {
    await requireAbility('purchasing:write');
    const { id: rawId, ...rest } = input;
    const id = z.string().uuid().parse(rawId);
    const data = updateDraftBody.parse(rest);

    await purchasingService.updateDraft(id, {
      ...data,
      items: data.items ? await resolveLines(data.items) : undefined,
    });

    revalidatePath('/admin/purchasing');
    revalidatePath(`/admin/purchasing/${id}`);
    return { id };
  },
);

export const submitPurchaseOrder = withAction(async (input: { id: string }) => {
  await requireAbility('purchasing:write');
  const id = z.string().uuid().parse(input.id);

  const result = await purchasingService.submit(id);

  revalidatePath('/admin/purchasing');
  revalidatePath(`/admin/purchasing/${id}`);
  return result;
});

export const cancelPurchaseOrder = withAction(async (input: { id: string }) => {
  await requireAbility('purchasing:write');
  const id = z.string().uuid().parse(input.id);

  const result = await purchasingService.cancel(id);

  revalidatePath('/admin/purchasing');
  revalidatePath(`/admin/purchasing/${id}`);
  return result;
});

export const deletePurchaseOrder = withAction(async (input: { id: string }) => {
  await requireAbility('purchasing:write');
  const id = z.string().uuid().parse(input.id);

  await purchasingService.deleteDraft(id);

  revalidatePath('/admin/purchasing');
  return { id };
});

const receiveBody = z.object({
  purchaseOrderId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1),
});

/** Book in a delivery. Credits stock and rolls the moving-average cost. */
export const receivePurchaseOrder = withAction(async (input: z.input<typeof receiveBody>) => {
  const session = await requireAbility('purchasing:receive');
  const data = receiveBody.parse(input);

  const result = await purchasingService.receive({
    purchaseOrderId: data.purchaseOrderId,
    lines: data.lines,
    note: data.note ?? null,
    receivedBy: session.sub,
  });

  // Stock is visible on the PDP — bust tagged DTO + ISR for affected products.
  const affected = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrderId: data.purchaseOrderId },
    select: { variant: { select: { product: { select: { slug: true } } } } },
  });
  const slugs = [...new Set(affected.map((row) => row.variant.product.slug))];
  await Promise.all(slugs.map((slug) => productsService.invalidate(slug)));
  for (const slug of slugs) revalidatePath(`/products/${slug}`);

  revalidatePath('/admin/purchasing');
  revalidatePath(`/admin/purchasing/${data.purchaseOrderId}`);
  revalidatePath('/admin/inventory');
  return result;
});
