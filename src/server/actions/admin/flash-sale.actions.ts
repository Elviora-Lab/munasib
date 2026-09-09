'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

import {
  MAX_FLASH_DISCOUNT_PERCENT,
  MAX_FLASH_SALE_ITEMS,
  MIN_FLASH_DISCOUNT_PERCENT,
} from '@/lib/flash-sale';
import { parseStoreDateTimeInput } from '@/utils/time';

import { withAction } from '../_with-action';

import { requireAdmin } from '@/server/auth/guards';
import { cacheTags } from '@/server/cache/tags';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { adminFlashSaleRepo } from '@/server/repositories/flash-sale.repo';
import { flashSaleService } from '@/server/services/flash-sale.service';
import { idInput } from '@/server/validators/admin-common.schema';

/** Required date string → Date, rejecting values Date.parse can't handle. */
const dateInput = z
  .string()
  .min(1, 'Required')
  .transform((s) => parseStoreDateTimeInput(s))
  .refine((d) => !Number.isNaN(d.getTime()), { message: 'Invalid date' });

const windowBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: dateInput,
    endsAt: dateInput,
    isActive: z.coerce.boolean().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'The sale must end after it starts',
    path: ['endsAt'],
  });

const itemsBody = z.object({
  id: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        discountPercent: z.coerce
          .number()
          .int()
          .min(MIN_FLASH_DISCOUNT_PERCENT)
          .max(MAX_FLASH_DISCOUNT_PERCENT),
      }),
    )
    // The cap the whole feature is specified around. Enforced here rather than
    // in the DB because it's a product rule, not a data-integrity invariant.
    .max(MAX_FLASH_SALE_ITEMS, `A flash sale can hold at most ${MAX_FLASH_SALE_ITEMS} products`),
});

/** Every write invalidates Redis display + Data Cache flash tag + PDP ISR HTML. */
async function afterWrite() {
  await flashSaleService.invalidateDisplay();
  revalidateTag(cacheTags.flashSale, 'max');
  revalidatePath('/admin/flash-sale');
  revalidatePath('/');
  // Tag busts `getProductPageData`; Full Route Cache is separate — also expire
  // every public PDP shell that may render flash pricing/countdown.
  revalidatePath('/products/[slug]', 'page');
}

export const createFlashSale = withAction(async (input: z.input<typeof windowBody>) => {
  await requireAdmin();
  const data = windowBody.parse(input);

  const sale = await adminFlashSaleRepo.create({
    title: data.title,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    isActive: data.isActive ?? false,
  });

  // Only one sale sells at a time — activating this one stands the others down.
  if (sale.isActive) await adminFlashSaleRepo.deactivateOthers(sale.id);

  await afterWrite();
  return { id: sale.id };
});

export const updateFlashSale = withAction(
  async (input: z.input<typeof windowBody> & { id: string }) => {
    await requireAdmin();
    const { id } = idInput.parse({ id: input.id });
    const data = windowBody.parse(input);

    if (!(await adminFlashSaleRepo.findById(id))) throw new NotFoundError('Flash sale not found');

    const sale = await adminFlashSaleRepo.update(id, {
      title: data.title,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      isActive: data.isActive ?? false,
    });
    if (sale.isActive) await adminFlashSaleRepo.deactivateOthers(sale.id);

    await afterWrite();
    return { id: sale.id };
  },
);

/**
 * Replace the curated product list. The admin UI always submits the full
 * ordered set, so array order becomes `position` — no separate reorder call.
 */
export const setFlashSaleItems = withAction(async (input: z.input<typeof itemsBody>) => {
  await requireAdmin();
  const data = itemsBody.parse(input);

  if (!(await adminFlashSaleRepo.findById(data.id)))
    throw new NotFoundError('Flash sale not found');

  // The unique index on (flash_sale_id, product_id) would reject this as a
  // P2002, but the message would name a constraint rather than the problem.
  const unique = new Set(data.items.map((i) => i.productId));
  if (unique.size !== data.items.length) {
    throw new BadRequestError('The same product is listed more than once');
  }

  await adminFlashSaleRepo.replaceItems(data.id, data.items);
  await afterWrite();
  return { count: data.items.length };
});

export const toggleFlashSale = withAction(async (input: { id: string; isActive: boolean }) => {
  await requireAdmin();
  const { id } = idInput.parse({ id: input.id });
  const isActive = z.coerce.boolean().parse(input.isActive);

  const sale = await adminFlashSaleRepo.update(id, { isActive });
  if (isActive) await adminFlashSaleRepo.deactivateOthers(id);

  await afterWrite();
  return { id: sale.id, isActive: sale.isActive };
});

export const deleteFlashSale = withAction(async (input: z.input<typeof idInput>) => {
  await requireAdmin();
  const { id } = idInput.parse(input);
  // Items cascade via the FK.
  await adminFlashSaleRepo.delete(id);
  await afterWrite();
  return { id };
});

/** Type-ahead source for the product picker. */
export const searchFlashSaleProducts = withAction(async (input: { query: string }) => {
  await requireAdmin();
  const query = z.string().trim().max(120).parse(input.query);
  if (query.length < 2) return { products: [] };

  const rows = await adminFlashSaleRepo.searchProducts(query, 20);
  return {
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      imageUrl: p.images[0]?.imageUrl ?? '',
    })),
  };
});
