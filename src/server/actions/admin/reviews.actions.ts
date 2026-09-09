'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';

import { withAction } from '../_with-action';

import { requireAdmin } from '@/server/auth/guards';
import { adminReviewsRepo } from '@/server/repositories/admin.repo';
import { productsService } from '@/server/services/products.service';

const reviewIdBody = z.object({ id: z.string().uuid() });

export const approveReview = withAction(async (input: z.infer<typeof reviewIdBody>) => {
  await requireAdmin();
  const { id } = reviewIdBody.parse(input);
  const review = await adminReviewsRepo.approve(id);
  const product = await prisma.product.findUnique({
    where: { id: review.productId },
    select: { slug: true },
  });
  productsService.invalidateReviews(review.productId, product?.slug);
  if (product?.slug) revalidatePath(`/products/${product.slug}`);
  revalidatePath('/admin/reviews');
  return { id };
});

export const deleteReview = withAction(async (input: z.infer<typeof reviewIdBody>) => {
  await requireAdmin();
  const { id } = reviewIdBody.parse(input);
  const review = await adminReviewsRepo.delete(id);
  const product = await prisma.product.findUnique({
    where: { id: review.productId },
    select: { slug: true },
  });
  productsService.invalidateReviews(review.productId, product?.slug);
  if (product?.slug) revalidatePath(`/products/${product.slug}`);
  revalidatePath('/admin/reviews');
  return { id };
});
