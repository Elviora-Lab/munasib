import { AdminListPagination } from '@/app/admin/_components/admin-list-pagination';

type Params = {
  q?: string;
  category?: string;
  brand?: string;
  status?: string;
  stock?: string;
  featured?: string;
  sort?: string;
};

/** Products list pagination — preserves filter/sort query params. */
export function ProductsPagination({
  page,
  pageSize,
  total,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Params;
}) {
  return (
    <AdminListPagination
      page={page}
      pageSize={pageSize}
      total={total}
      basePath="/admin/products"
      emptyLabel="No products"
      params={{
        q: params.q,
        category: params.category,
        brand: params.brand,
        status: params.status,
        stock: params.stock,
        featured: params.featured,
        sort: params.sort && params.sort !== 'created_desc' ? params.sort : undefined,
      }}
    />
  );
}
