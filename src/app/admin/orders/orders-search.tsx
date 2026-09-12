'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PAYMENT_OPTIONS = [
  { value: '', label: 'Any payment' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'AUTHORIZED', label: 'Authorized' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'PARTIALLY_REFUNDED', label: 'Partial refund' },
  { value: 'VOIDED', label: 'Voided' },
] as const;

const SORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest' },
  { value: 'total_desc', label: 'Total ↓' },
  { value: 'total_asc', label: 'Total ↑' },
] as const;

const selectClassName =
  'h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Debounced search + payment filter + sort for the admin orders list.
 * Matches order number, customer name/email/phone/city, or PostEx tracking.
 */
export function OrdersSearch() {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, start] = useTransition();

  const q = search.get('q') ?? '';
  const payment = search.get('payment') ?? '';
  const sort = search.get('sort') ?? '';

  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);

  const setParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete('page'); // filter/sort changes return to the first page
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

  const hasExtras = Boolean(q || payment || sort);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={term}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search order #, name, phone, email, city, tracking…"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>

        <select
          value={payment}
          onChange={(e) => setParams({ payment: e.target.value })}
          aria-label="Filter by payment status"
          className={selectClassName}
        >
          {PAYMENT_OPTIONS.map((o) => (
            <option key={o.value || 'any'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setParams({ sort: e.target.value })}
          aria-label="Sort orders"
          className={selectClassName}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value || 'default'} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>

        {hasExtras ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTerm('');
              setParams({ q: '', payment: '', sort: '' });
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        ) : null}
        {pending ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
      </div>
      {!sort ? (
        <p className="text-xs text-muted-foreground">
          Default sort: newest first (oldest first in booked/printed/packed/leftover).
        </p>
      ) : null}
    </div>
  );
}
