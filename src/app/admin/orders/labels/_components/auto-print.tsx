'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Auto-triggers the print dialog on mount, then keeps a small toolbar
 * visible on screen (hidden via @media print) for re-printing or going back.
 */
export function AutoPrint({
  count,
  noun = 'shipping label',
}: {
  count: number;
  /** Singular noun used in the toolbar copy (e.g. "packing checklist"). */
  noun?: string;
}) {
  useEffect(() => {
    // Wait one tick so images / fonts have a chance to lay out.
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);

  const plural = count === 1 ? noun : `${noun}s`;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-border bg-card px-6 py-3 shadow-sm print:hidden">
      <div className="text-sm text-muted-foreground">
        {count} {plural} ready · the print dialog will open shortly.
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => window.print()}>
          Re-open print dialog
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/orders">← Back to orders</Link>
        </Button>
      </div>
    </div>
  );
}
