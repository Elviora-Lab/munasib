'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { toSlug } from '@/utils/slug';

import { withAction } from '../_with-action';

import { requireAdmin } from '@/server/auth/guards';
import { adminBrandsRepo } from '@/server/repositories/admin.repo';
import { brandsService } from '@/server/services/brands.service';
import { idInput } from '@/server/validators/admin-common.schema';

const brandBody = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(180).optional(),
  description: z.string().max(2000).optional(),
  logo: z.string().url().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createBrand = withAction(async (input: z.infer<typeof brandBody>) => {
  await requireAdmin();
  const data = brandBody.parse(input);
  const brand = await adminBrandsRepo.create({
    name: data.name,
    slug: data.slug || toSlug(data.name),
    description: data.description,
    logo: data.logo,
    isActive: data.isActive ?? true,
  });
  brandsService.invalidate(brand.slug);
  revalidatePath('/admin/brands');
  return brand;
});

export const deleteBrand = withAction(async (input: { id: string }) => {
  await requireAdmin();
  const { id } = idInput.parse(input);
  const brand = await adminBrandsRepo.delete(id);
  brandsService.invalidate(brand.slug);
  revalidatePath('/admin/brands');
  return { id: input.id };
});
