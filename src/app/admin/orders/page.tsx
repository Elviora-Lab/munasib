import { Suspense } from 'react';
import Link from 'next/link';
import { OrderStatus, PaymentStatus } from '@prisma/client';
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

import { AdminListPagination } from '@/app/admin/_components/admin-list-pagination';
import { type AdminOrderSort, adminOrdersRepo } from '@/server/repositories/admin.repo';

export const metadata = buildMetadata({ title: 'Admin · Orders', noIndex: true });
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const statusValues = Object.values(OrderStatus);
const paymentValues = Object.values(PaymentStatus);
const stageValues = ['NEEDS_BOOKING', 'BOOKED', 'PRINTED', 'PACKED', 'LEFTOVER'] as const;
const sortValues = [
  'created_desc',
  'created_asc',
  'total_desc',
  'total_asc',
] as const satisfies readonly AdminOrderSort[];

const filterSchema = z.object({
  status: z.enum(statusValues as [OrderStatus, ...OrderStatus[]]).optional(),
  payment: z.enum(paymentValues as [PaymentStatus, ...PaymentStatus[]]).optional(),
  q: z.string().trim().max(120).optional(),
  stage: z.enum(stageValues).optional(),
  sort: z.enum(sortValues).optional(),
});

type ListQuery = {
  status?: OrderStatus;
  payment?: PaymentStatus;
  q?: string;
  stage?: (typeof stageValues)[number];
  sort?: AdminOrderSort;
};

type Props = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    stage?: string;
    payment?: string;
    sort?: string;
    page?: string;
  }>;
};

function ordersHref(opts: ListQuery) {
  const params = new URLSearchParams();
  if (opts.stage) params.set('stage', opts.stage);
  else if (opts.status) params.set('status', opts.status);
  if (opts.q) params.set('q', opts.q);
  if (opts.payment) params.set('payment', opts.payment);
  if (opts.sort) params.set('sort', opts.sort);
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const raw = await searchParams;
  const parsed = filterSchema.safeParse({
    status: raw.status,
    q: raw.q,
    stage: raw.stage,
    payment: raw.payment,
    sort: raw.sort,
  });
  const { status, q, stage, payment, sort } = parsed.success ? parsed.data : {};
  const page = Math.max(1, Number(raw.page) || 1);

  const baseQuery: ListQuery = { q, payment, sort };

  const [[items, total], stageCounts] = await Promise.all([
    adminOrdersRepo.list({
      status,
      q,
      stage,
      paymentStatus: payment,
      sort,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
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
          <Link href={ordersHref(baseQuery)}>All</Link>
        </Button>
        {statusValues.map((s) => (
          <Button
            key={s}
            asChild
            size="sm"
            variant={status === s && !stage ? 'primary' : 'outline'}
          >
            <Link href={ordersHref({ ...baseQuery, status: s })}>{s}</Link>
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
                <Link href={ordersHref({ ...baseQuery, stage: key })}>
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

      <AdminListPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/orders"
        emptyLabel="No orders"
        params={{
          status: stage ? undefined : status,
          stage,
          q,
          payment,
          sort,
        }}
      />
    </div>
  );
}
