'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const inputClassName =
  'h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function karachiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysKey(yyyyMmDd: string, delta: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return utc.toISOString().slice(0, 10);
}

/**
 * Order-created date range (Asia/Karachi calendar days) for pending items.
 * Preserves status / stage / view query params.
 */
export function PendingItemsDateRange() {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, start] = useTransition();

  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(search.toString());
      if (nextFrom) params.set('from', nextFrom);
      else params.delete('from');
      if (nextTo) params.set('to', nextTo);
      else params.delete('to');
      start(() => {
        router.push(`?${params.toString()}`, { scroll: false });
      });
    },
    [router, search],
  );

  const today = karachiToday();
  const hasRange = Boolean(from || to);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Order date (Pakistan)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setRange(e.target.value, to)}
            className={inputClassName}
            aria-label="From date"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setRange(from, e.target.value)}
            className={inputClassName}
            aria-label="To date"
          />
        </label>

        <Button
          type="button"
          size="sm"
          variant={from === today && to === today ? 'primary' : 'outline'}
          onClick={() => setRange(today, today)}
        >
          Today
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const y = addDaysKey(today, -1);
            setRange(y, y);
          }}
        >
          Yesterday
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRange(addDaysKey(today, -6), today)}
        >
          Last 7 days
        </Button>

        {hasRange ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRange('', '')}>
            <X className="size-3.5" /> Clear dates
          </Button>
        ) : null}

        {pending ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
      </div>
    </div>
  );
}
