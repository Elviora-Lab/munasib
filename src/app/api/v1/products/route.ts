import { normalizeProductSort } from '@/lib/products/sort';

import { analyticsServer } from '@/server/analytics';
import { getSession } from '@/server/auth/get-session';
import { createHandler } from '@/server/http/handler';
import { paginated, resolvePagination } from '@/server/http/pagination';
import { parseQuery } from '@/server/http/parse';
import { apiSuccess } from '@/server/http/response';
import { productsService } from '@/server/services/products.service';
import { productListQuery } from '@/server/validators/products.schema';

export const runtime = 'nodejs';
/** Align with productsService list Data Cache TTL (600s). */
export const revalidate = 600;

export const GET = createHandler(async (req) => {
  const q = parseQuery(req, productListQuery);
  const pg = resolvePagination(q);

  const { items, total } = await productsService.list(
    {
      category: q.category,
      brand: q.brand,
      q: q.q,
      priceMin: q.priceMin,
      priceMax: q.priceMax,
      concern: q.concern,
      tag: q.tag,
    },
    normalizeProductSort(q.sort),
    pg.page,
    pg.pageSize,
  );

  // Log real searches (a `q` term) for the admin "top searches" panel. Only the
  // first page, so paging through results doesn't inflate counts. Best-effort.
  if (q.q && q.q.trim() && pg.page === 1) {
    const session = await getSession(req);
    void analyticsServer.search(q.q.trim(), total, session?.sub ?? null);
  }

  return apiSuccess(paginated(items, total, pg));
});
