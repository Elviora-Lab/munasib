'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { formatDate } from '@/utils/format';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  addManualShipment,
  bookWithPostEx,
  bulkMarkPacked,
  cancelPostExBooking,
  refreshPostExPayment,
  refreshPostExTracking,
} from '@/server/actions/admin/orders.actions';

type Settlement = { settled: boolean; settlementDate: string | null; cprNumber: string | null };

type Shipment = {
  courierName: string;
  trackingNumber: string | null;
  shipmentStatus: string;
  trackingStatusText: string | null;
  trackingJourney: string | null;
  trackingSyncedAt: Date | null;
  labelPrintedAt: Date | null;
  packedAt: Date | null;
} | null;

export function CourierCard({
  orderId,
  shipment,
  configured,
}: {
  orderId: string;
  shipment: Shipment;
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [journey, setJourney] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function book() {
    start(async () => {
      const res = await bookWithPostEx({ orderId });
      if (res.success) {
        toast.success(`Booked with PostEx — CN ${res.data.trackingNumber}`);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function refresh() {
    start(async () => {
      const res = await refreshPostExTracking({ orderId });
      if (res.success) {
        setStatus(res.data.status);
        setJourney(res.data.journey);
        if (res.data.shipped) {
          toast.success(`Shipped — ${res.data.status}`);
        } else {
          toast.success(res.data.status);
        }
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function checkSettlement() {
    start(async () => {
      const res = await refreshPostExPayment({ orderId });
      if (res.success) {
        setSettlement(res.data);
        toast.success(res.data.settled ? 'COD settled by PostEx' : 'COD not settled yet');
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function markPacked() {
    start(async () => {
      const res = await bulkMarkPacked({ orderIds: [orderId] });
      if (res.success) {
        if (res.data.packed > 0) toast.success('Marked packed');
        else toast.message('Already packed or not booked');
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function cancelBooking() {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    start(async () => {
      const res = await cancelPostExBooking({ orderId });
      if (res.success) {
        toast.success('PostEx booking cancelled');
        router.refresh();
      } else {
        toast.error(res.message);
        setConfirmingCancel(false);
      }
    });
  }

  if (shipment?.trackingNumber) {
    const tn = shipment.trackingNumber;
    const stageLabel = shipment.packedAt
      ? 'Packed'
      : shipment.labelPrintedAt
        ? 'Printed'
        : 'Booked';
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Courier:</span> {shipment.courierName}
        </div>
        <div>
          <span className="text-muted-foreground">Tracking #:</span>{' '}
          <span className="font-mono">{tn}</span>
        </div>
        <div className="text-xs text-muted-foreground">Floor stage: {stageLabel}</div>
        <div className="text-xs text-muted-foreground">
          Status: {status ?? shipment.trackingStatusText ?? shipment.shipmentStatus}
        </div>
        {(journey ?? shipment.trackingJourney) ? (
          <div className="text-xs text-muted-foreground">
            Journey: {journey ?? shipment.trackingJourney}
          </div>
        ) : null}
        {shipment.trackingSyncedAt ? (
          <div className="text-xs text-muted-foreground">
            Synced:{' '}
            {formatDate(shipment.trackingSyncedAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        ) : null}
        {settlement ? (
          <div className="text-xs text-muted-foreground">
            COD:{' '}
            {settlement.settled
              ? `Settled${settlement.settlementDate ? ` on ${settlement.settlementDate}` : ''}${
                  settlement.cprNumber ? ` · CPR ${settlement.cprNumber}` : ''
                }`
              : 'Not settled yet'}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" loading={pending} onClick={refresh}>
            Refresh status
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                `/api/v1/admin/postex/label?tracking=${encodeURIComponent(tn)}`,
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            Print label
          </Button>
          {!shipment.packedAt ? (
            <Button size="sm" variant="outline" loading={pending} onClick={markPacked}>
              Mark packed
            </Button>
          ) : null}
          <Button size="sm" variant="outline" loading={pending} onClick={checkSettlement}>
            Check COD
          </Button>
          <Button size="sm" variant="ghost" loading={pending} onClick={cancelBooking}>
            {confirmingCancel ? 'Confirm cancel?' : 'Cancel booking'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {!configured ? (
          <p className="text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1">POSTEX_API_TOKEN</code> to enable courier
            booking.
          </p>
        ) : null}
        <Button loading={pending} disabled={!configured} onClick={book}>
          Book with PostEx
        </Button>
      </div>
      <ManualShipmentForm orderId={orderId} />
    </div>
  );
}

/** Record a shipment booked with any other courier (TCS, Leopards, rider…). */
function ManualShipmentForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onSubmit(formData: FormData) {
    start(async () => {
      const result = await addManualShipment({
        orderId,
        courierName: String(formData.get('courierName') ?? ''),
        trackingNumber: String(formData.get('trackingNumber') ?? ''),
      });
      if (result.success) {
        toast.success(`Shipment recorded — ${result.data.trackingNumber}`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Or record manually
      </p>
      <Input name="courierName" required placeholder="Courier (e.g. TCS)" className="h-9" />
      <Input name="trackingNumber" required placeholder="Tracking number" className="h-9" />
      <Button size="sm" variant="outline" type="submit" loading={pending}>
        Save & mark shipped
      </Button>
    </form>
  );
}
