'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OrderStatus } from '@prisma/client';
import { PackageCheck, Printer } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import {
  deriveFulfillmentStage,
  FULFILLMENT_STAGE_LABEL,
  fulfillmentAgeLabel,
  type FulfillmentStage,
} from '@/lib/fulfillment-stage';
import { formatDate, formatMoney } from '@/utils/format';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import {
  bulkBookWithPostEx,
  bulkMarkPacked,
  bulkUpdateOrderStatus,
  getPostExTrackingForOrders,
  markLabelsPrinted,
} from '@/server/actions/admin/orders.actions';

type Row = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  orderStatus: OrderStatus;
  paymentStatus: string;
  fulfillmentStage: FulfillmentStage;
  leftover: boolean;
  leftoverLabel: string | null;
  shipment: {
    courierName: string;
    trackingNumber: string | null;
    shipmentStatus: string;
    trackingStatusText: string | null;
    trackingJourney: string | null;
    trackingSyncedAt: Date | null;
    createdAt: Date;
    labelPrintedAt: Date | null;
    packedAt: Date | null;
  } | null;
  itemCount: number;
  totalAmount: number;
  currency: string;
  createdAt: Date;
};

const STATUS_VALUES = Object.values(OrderStatus);

/** Keep each PostEx book wave short so the server action does not time out mid-batch. */
const POSTEX_BOOK_CHUNK = 15;

const STAGE_BADGE: Record<FulfillmentStage, 'muted' | 'outline' | 'success' | 'gold' | 'info'> = {
  NEEDS_BOOKING: 'muted',
  BOOKED: 'outline',
  PRINTED: 'info',
  PACKED: 'success',
};

export function OrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>('CONFIRMED');
  const [pending, start] = useTransition();

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );
  const someSelected = selected.size > 0 && !allSelected;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const canBook = selectedRows.some((r) => r.fulfillmentStage === 'NEEDS_BOOKING');
  const canPrint = selectedRows.some(
    (r) =>
      r.fulfillmentStage === 'BOOKED' ||
      r.fulfillmentStage === 'PRINTED' ||
      r.fulfillmentStage === 'PACKED',
  );
  const canPack = selectedRows.some(
    (r) => r.fulfillmentStage === 'PRINTED' || r.fulfillmentStage === 'BOOKED',
  );

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  /** Keep only the given ids selected (e.g. failures after a bulk action). */
  function keepOnly(ids: Iterable<string>) {
    setSelected(new Set(ids));
  }

  function applyBulkStatus() {
    if (selectedIds.length === 0) return;
    const noun = `${selectedIds.length} order${selectedIds.length === 1 ? '' : 's'}`;
    if (!confirm(`Set ${noun} → ${bulkStatus}?`)) return;
    start(async () => {
      const result = await bulkUpdateOrderStatus({
        orderIds: selectedIds,
        status: bulkStatus,
      });
      if (result.success) {
        toast.success(`${result.data.updated} of ${result.data.requested} → ${bulkStatus}`);
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function printSelected() {
    if (selectedIds.length === 0) return;
    const ids = selectedIds.join(',');
    window.open(`/admin/orders/labels?ids=${encodeURIComponent(ids)}`, '_blank');
    start(async () => {
      await markLabelsPrinted({ orderIds: selectedIds });
      toast.success(`Printing ${selectedIds.length} label${selectedIds.length === 1 ? '' : 's'}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function bookSelectedWithPostEx() {
    if (selectedIds.length === 0) return;
    const toBook = selectedRows
      .filter((r) => r.fulfillmentStage === 'NEEDS_BOOKING')
      .map((r) => r.id);
    const skip = selectedIds.length - toBook.length;
    if (toBook.length === 0) {
      toast.message('Selected orders are already booked');
      return;
    }
    const noun = `${toBook.length} order${toBook.length === 1 ? '' : 's'}`;
    if (
      !confirm(
        `Book ${noun} with PostEx? Status will move to PROCESSING.${skip > 0 ? ` (${skip} already booked will be skipped.)` : ''}`,
      )
    ) {
      return;
    }
    start(async () => {
      let booked = 0;
      let failed = 0;
      let firstError: string | undefined;
      const failedIds = new Set<string>();
      const bookedIds = new Set<string>();

      for (let i = 0; i < toBook.length; i += POSTEX_BOOK_CHUNK) {
        const chunk = toBook.slice(i, i + POSTEX_BOOK_CHUNK);
        const result = await bulkBookWithPostEx({ orderIds: chunk });
        if (!result.success) {
          toast.error(result.message);
          keepOnly([...failedIds, ...chunk]);
          router.refresh();
          return;
        }
        booked += result.data.booked;
        failed += result.data.failed;
        for (const id of result.data.bookedOrderIds) bookedIds.add(id);
        for (const err of result.data.errors) {
          failedIds.add(err.orderId);
          if (!firstError) firstError = err.message;
        }
      }

      if (booked > 0) toast.success(`Booked ${booked} with PostEx`);
      if (failed > 0) {
        toast.error(
          `${failed} failed${firstError ? `: ${firstError}` : ''}${failed > 1 ? '…' : ''} — still selected`,
        );
      }
      keepOnly(failedIds);
      router.refresh();
    });
  }

  function printSelectedPostExLabels() {
    if (selectedIds.length === 0) return;
    const popup = window.open('about:blank', '_blank');
    start(async () => {
      const result = await getPostExTrackingForOrders({ orderIds: selectedIds });
      if (!result.success) {
        popup?.close();
        toast.error(result.message);
        return;
      }
      const { trackingNumbers, missing } = result.data;
      if (trackingNumbers.length === 0) {
        popup?.close();
        toast.error('No PostEx tracking numbers on the selected orders — book first');
        return;
      }
      if (missing > 0) {
        toast.message(`${missing} selected order(s) have no PostEx booking yet`);
      }
      const url = `/api/v1/admin/postex/label?tracking=${encodeURIComponent(trackingNumbers.join(','))}`;
      if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      // API stamps print state; refresh so rows move Booked → Printed.
      toast.success(
        `Printing ${trackingNumbers.length} PostEx AWB${trackingNumbers.length === 1 ? '' : 's'}`,
      );
      // Keep unbooked selection; clear those that had tracking.
      const unbooked = selectedRows.filter((r) => !r.shipment?.trackingNumber).map((r) => r.id);
      keepOnly(unbooked);
      router.refresh();
    });
  }

  function markSelectedPacked() {
    if (selectedIds.length === 0) return;
    const noun = `${selectedIds.length} order${selectedIds.length === 1 ? '' : 's'}`;
    if (!confirm(`Mark ${noun} as packed?`)) return;
    start(async () => {
      const result = await bulkMarkPacked({ orderIds: selectedIds });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      const { packed, requested, orderIds } = result.data;
      if (packed > 0) toast.success(`Marked ${packed} packed`);
      if (packed < requested) {
        toast.message(`${requested - packed} skipped (already packed or not booked)`);
      }
      const packedSet = new Set(orderIds);
      keepOnly(selectedIds.filter((id) => !packedSet.has(id)));
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        No orders match this filter.
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 backdrop-blur-sm transition-all',
          selectedIds.length === 0 && 'hidden',
        )}
      >
        <span className="text-sm font-medium">{selectedIds.length} selected</span>

        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Status →
          </label>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as OrderStatus)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={applyBulkStatus} loading={pending}>
            Apply
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={bookSelectedWithPostEx}
            loading={pending}
            disabled={!canBook}
          >
            Book PostEx ({selectedIds.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={printSelectedPostExLabels}
            loading={pending}
            disabled={!canPrint}
          >
            <Printer className="size-3.5" /> PostEx AWB
          </Button>
          <Button size="sm" variant="outline" onClick={printSelected} disabled={!canPrint}>
            <Printer className="size-3.5" /> Print labels
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={markSelectedPacked}
            loading={pending}
            disabled={!canPack}
          >
            <PackageCheck className="size-3.5" /> Mark packed
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>

      <table className="w-full min-w-[1180px] text-sm">
        <thead className="border-b border-border">
          <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={(e) => toggleAll(e.target.checked)}
                aria-label="Select all orders on this page"
                className="size-4 cursor-pointer rounded border-border accent-foreground"
              />
            </th>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Courier</th>
            <th className="px-4 py-3">Payment</th>
            <th className="px-4 py-3">Items</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Placed</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const checked = selected.has(o.id);
            const stage = o.fulfillmentStage ?? deriveFulfillmentStage(o.shipment);
            const age = o.leftoverLabel ?? fulfillmentAgeLabel(o.shipment);
            return (
              <tr
                key={o.id}
                className={cn(
                  'border-b border-border/60 transition-colors last:border-b-0',
                  checked && 'bg-muted/30',
                  o.leftover && 'border-l-2 border-l-amber-500/80',
                )}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleOne(o.id, e.target.checked)}
                    aria-label={`Select ${o.orderNumber}`}
                    className="size-4 cursor-pointer rounded border-border accent-foreground"
                  />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-4 py-3">
                  {o.customerName || o.customerEmail || o.customerPhone ? (
                    <>
                      {o.customerName ? <div className="font-medium">{o.customerName}</div> : null}
                      <div className="text-xs text-muted-foreground">
                        {o.customerEmail ?? o.customerPhone}
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={STAGE_BADGE[stage]}>{FULFILLMENT_STAGE_LABEL[stage]}</Badge>
                    {age ? (
                      <Badge variant="gold" className="font-normal">
                        {age}
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="muted">{o.orderStatus}</Badge>
                </td>
                <td className="max-w-[260px] px-4 py-3">
                  {o.shipment ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{o.shipment.courierName}</span>
                        <Badge variant="outline">
                          {o.shipment.trackingStatusText ?? o.shipment.shipmentStatus}
                        </Badge>
                      </div>
                      {o.shipment.trackingNumber ? (
                        <div className="font-mono text-xs text-muted-foreground">
                          {o.shipment.trackingNumber}
                        </div>
                      ) : null}
                      {o.shipment.trackingJourney ? (
                        <div className="line-clamp-2 text-xs text-muted-foreground">
                          {o.shipment.trackingJourney}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={o.paymentStatus === 'PAID' ? 'success' : 'muted'}>
                    {o.paymentStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3">{o.itemCount}</td>
                <td className="px-4 py-3">{formatMoney(o.totalAmount, o.currency)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
