'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toSlug } from '@/utils/slug';

import { withAction } from '../_with-action';

import { requireAdmin } from '@/server/auth/guards';
import { BadRequestError } from '@/server/http/errors';
import { adminCategoriesRepo } from '@/server/repositories/admin.repo';
import { categoriesService } from '@/server/services/categories.service';
import { idInput } from '@/server/validators/admin-common.schema';

const categoryBody = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(180).optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createCategory = withAction(async (input: z.infer<typeof categoryBody>) => {
  await requireAdmin();
  const data = categoryBody.parse(input);

  // The taxonomy is one level deep (products.repo rolls subcategory products
  // up to the parent). Requiring the parent to be a ROOT category enforces
  // that depth cap — and structurally rules out parent cycles.
  if (data.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: data.parentId },
      select: { parentId: true },
    });
    if (!parent) throw new BadRequestError('Parent category not found');
    if (parent.parentId) {
      throw new BadRequestError('Categories can only be nested one level deep');
    }
  }

  const cat = await adminCategoriesRepo.create({
    name: data.name,
    slug: data.slug || toSlug(data.name),
    description: data.description,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
    ...(data.parentId ? { parent: { connect: { id: data.parentId } } } : {}),
  });
  categoriesService.invalidate(cat.slug);
  revalidatePath('/admin/categories');
  revalidatePath('/categories');
  revalidatePath(`/categories/${cat.slug}`);
  revalidatePath('/');
  return cat;
});

export const deleteCategory = withAction(async (input: { id: string }) => {
  await requireAdmin();
  const { id } = idInput.parse(input);
  const cat = await adminCategoriesRepo.delete(id);
  categoriesService.invalidate(cat.slug);
  revalidatePath('/admin/categories');
  revalidatePath('/categories');
  revalidatePath('/');
  return { id: input.id };
});
