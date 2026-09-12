'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CategoryOption = { id: string; name: string };
type BrandOption = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'hidden', label: 'Hidden' },
] as const;

const STOCK_OPTIONS = [
  { value: '', label: 'Any stock' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low (≤5)' },
  { value: 'out', label: 'Out of stock' },
] as const;

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
] as const;

const selectClassName =
  'h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function ProductsFilters({
  categories,
  brands,
}: {
  categories: CategoryOption[];
  brands: BrandOption[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, start] = useTransition();

  const q = search.get('q') ?? '';
  const category = search.get('category') ?? '';
  const brand = search.get('brand') ?? '';
  const status = search.get('status') ?? '';
  const stock = search.get('stock') ?? '';
  const featured = search.get('featured') === '1';
  const sort = search.get('sort') ?? 'created_desc';

  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);

  const setParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // Default sort stays out of the URL.
      if (params.get('sort') === 'created_desc') params.delete('sort');
      params.delete('page');
      start(() => {
        router.push(`?${params.toString()}`, { scroll: false });
      });
    },
    [router, search],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = useCallback(
    (value: string) => {
      setTerm(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setParams({ q: value.trim() }), 300);
    },
    [setParams],
  );
  useEffect(() => () => void (debounceRef.current && clearTimeout(debounceRef.current)), []);

  const hasFilters = Boolean(q || category || brand || status || stock || featured);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={term}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, SKU or shade…"
            className="pl-9"
            aria-label="Search products"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setParams({ category: e.target.value })}
          aria-label="Filter by category"
          className={selectClassName}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {brands.length > 0 ? (
          <select
            value={brand}
            onChange={(e) => setParams({ brand: e.target.value })}
            aria-label="Filter by brand"
            className={selectClassName}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={stock}
          onChange={(e) => setParams({ stock: e.target.value })}
          aria-label="Filter by stock"
          className={selectClassName}
        >
          {STOCK_OPTIONS.map((o) => (
            <option key={o.value || 'any'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setParams({ sort: e.target.value })}
          aria-label="Sort products"
          className={selectClassName}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>

        <div className="flex gap-1.5">
          {STATUS_OPTIONS.map((o) => (
            <Button
              key={o.value || 'all'}
              size="sm"
              variant={status === o.value ? 'primary' : 'outline'}
              onClick={() => setParams({ status: o.value })}
            >
              {o.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={featured ? 'primary' : 'outline'}
            onClick={() => setParams({ featured: featured ? '' : '1' })}
          >
            Featured
          </Button>
        </div>

        {hasFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTerm('');
              setParams({
                q: '',
                category: '',
                brand: '',
                status: '',
                stock: '',
                featured: '',
                sort: '',
              });
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        ) : null}
      </div>

      {pending ? <span className="text-xs text-muted-foreground">Filtering…</span> : null}
    </div>
  );
}
