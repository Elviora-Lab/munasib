import { Suspense } from 'react';
import Link from 'next/link';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

import {
  deriveFulfillmentStage,
  fulfillmentAgeLabel,
  isFulfillmentLeftover,
} from '@/lib/fulfillment-stage';
import { buildMetadata } from '@/lib/seo/metadata';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { OrdersSearch } from './orders-search';
import { OrdersTable } from './orders-table';

import { adminOrdersRepo } from '@/server/repositories/admin.repo';

export const metadata = buildMetadata({ title: 'Admin · Orders', noIndex: true });
export const dynamic = 'force-dynamic';

const statusValues = Object.values(OrderStatus);
const stageValues = ['NEEDS_BOOKING', 'BOOKED', 'PRINTED', 'PACKED', 'LEFTOVER'] as const;

const filterSchema = z.object({
  status: z.enum(statusValues as [OrderStatus, ...OrderStatus[]]).optional(),
  q: z.string().trim().max(120).optional(),
  stage: z.enum(stageValues).optional(),
});

type Props = { searchParams: Promise<{ status?: string; q?: string; stage?: string }> };

function statusHref(status?: OrderStatus, q?: string, stage?: string) {
  const params = new URLSearchParams();
  if (stage) {
    params.set('stage', stage);
  } else if (status) {
    params.set('status', status);
  }
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const raw = await searchParams;
  const { status, q, stage } = filterSchema.parse({
    status: raw.status,
    q: raw.q,
    stage: raw.stage,
  });

  const [[items, total], stageCounts] = await Promise.all([
    adminOrdersRepo.list({ status, q, stage, take: 100 }),
    adminOrdersRepo.fulfillmentStageCounts(),
  ]);

  const rows = items.map((o) => {
    const shipment = o.shipments[0]
      ? {
          courierName: o.shipments[0].courierName,
          trackingNumber: o.shipments[0].trackingNumber,
          shipmentStatus: o.shipments[0].shipmentStatus,
          trackingStatusText: o.shipments[0].trackingStatusText,
          trackingJourney: o.shipments[0].trackingJourney,
          trackingSyncedAt: o.shipments[0].trackingSyncedAt,
          createdAt: o.shipments[0].createdAt,
          labelPrintedAt: o.shipments[0].labelPrintedAt,
          packedAt: o.shipments[0].packedAt,
        }
      : null;

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName:
        o.shippingFullName ??
        ([o.user?.firstName, o.user?.lastName].filter(Boolean).join(' ').trim() || null),
      customerEmail: o.user?.email ?? o.shippingEmail ?? null,
      customerPhone: o.shippingPhone ?? null,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      fulfillmentStage: deriveFulfillmentStage(shipment),
      leftover: isFulfillmentLeftover(shipment),
      leftoverLabel: fulfillmentAgeLabel(shipment),
      shipment,
      itemCount: o._count.items,
      totalAmount: Number(o.totalAmount),
      currency: o.currency,
      createdAt: o.createdAt,
    };
  });

  const showFulfillmentChips =
    Boolean(stage) || status === 'PROCESSING' || status === 'CONFIRMED' || !status;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="editorial-heading text-display-md">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {total} matching — track status, fulfilment, refunds.
          </p>
        </div>
        <Link
          href="/admin/orders/pending-items"
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          Pending items →
        </Link>
      </header>

      <Suspense fallback={null}>
        <OrdersSearch />
      </Suspense>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={!status && !stage ? 'primary' : 'outline'}>
          <Link href={statusHref(undefined, q)}>All</Link>
        </Button>
        {statusValues.map((s) => (
          <Button
            key={s}
            asChild
            size="sm"
            variant={status === s && !stage ? 'primary' : 'outline'}
          >
            <Link href={statusHref(s, q)}>{s}</Link>
          </Button>
        ))}
      </div>

      {showFulfillmentChips ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Fulfillment pipeline
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['NEEDS_BOOKING', 'Needs booking', stageCounts.needsBooking],
                ['BOOKED', 'Booked', stageCounts.booked],
                ['PRINTED', 'Printed', stageCounts.printed],
                ['PACKED', 'Packed', stageCounts.packed],
                ['LEFTOVER', 'Leftover', stageCounts.leftover],
              ] as const
            ).map(([key, label, count]) => (
              <Button key={key} asChild size="sm" variant={stage === key ? 'primary' : 'outline'}>
                <Link href={statusHref(undefined, q, key)}>
                  {label}
                  <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                </Link>
              </Button>
            ))}
            {status === 'PROCESSING' && !stage ? (
              <span className="self-center text-xs text-muted-foreground">
                All processing (use chips to filter by stage)
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <OrdersTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
