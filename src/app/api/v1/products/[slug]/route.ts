import { createHandler } from '@/server/http/handler';
import { parseParams } from '@/server/http/parse';
import { apiSuccess } from '@/server/http/response';
import { productsService } from '@/server/services/products.service';
import { productSlugParams } from '@/server/validators/products.schema';

export const runtime = 'nodejs';
export const revalidate = 3600;

export const GET = createHandler<{ slug: string }>(async (req, ctx) => {
  const { slug } = await parseParams(ctx, productSlugParams);
  // Public catalog read — do not attribute a view or personalize; keeps the
  // response cacheable. PDP views go through the client beacon instead.
  const product = await productsService.getBySlug(slug, { track: false });
  return apiSuccess(product);
});
