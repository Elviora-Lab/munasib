import Link from 'next/link';

import { prisma } from '@/lib/db';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate } from '@/utils/format';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PostExDashboardClient } from './postex-dashboard-client';

import {
  getPostExOperationalCities,
  getPostExOrderStatuses,
  getPostExOrderTypes,
  getPostExPickupAddresses,
  isPostExConfigured,
  type PostExOperationalCity,
  type PostExPickupAddress,
} from '@/server/shipping/postex';

export const metadata = buildMetadata({ title: 'Admin · PostEx', noIndex: true });
export const dynamic = 'force-dynamic';

type Loaded<T> = { data: T; error: string | null };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<Loaded<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: fallback, error: err instanceof Error ? err.message : 'Unable to load' };
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export default async function AdminPostExPage() {
  const configured = isPostExConfigured();
  const [cities, pickups, orderTypes, orderStatuses, localShipments] = await Promise.all([
    configured ? safe(() => getPostExOperationalCities(), [] as PostExOperationalCity[]) : null,
    configured ? safe(() => getPostExPickupAddresses(), [] as PostExPickupAddress[]) : null,
    configured ? safe(() => getPostExOrderTypes(), [] as string[]) : null,
    configured ? safe(() => getPostExOrderStatuses(), [] as string[]) : null,
    prisma.shipment.findMany({
      where: { courierName: 'PostEx' },
      orderBy: [{ shippedAt: 'desc' }, { id: 'desc' }],
      take: 25,
      select: {
        id: true,
        trackingNumber: true,
        shipmentStatus: true,
        trackingStatusText: true,
        trackingJourney: true,
        trackingSyncedAt: true,
        shippedAt: true,
        deliveredAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            paymentStatus: true,
            shippingCity: true,
            shippingFullName: true,
          },
        },
      },
    }),
  ]);

  const cityRows = cities?.data ?? [];
  const pickupRows = pickups?.data ?? [];
  const deliveryCities = cityRows.filter((c) => c.isDeliveryCity).length;
  const pickupCities = cityRows.filter((c) => c.isPickupCity).length;
  const errors = [cities, pickups, orderTypes, orderStatuses].flatMap((entry) =>
    entry?.error ? [entry.error] : [],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="editorial-heading text-display-md">PostEx</h1>
          <p className="text-sm text-muted-foreground">
            Courier booking, labels, tracking, COD settlement, and merchant setup.
          </p>
        </div>
        <Badge variant={configured ? 'success' : 'danger'}>
          {configured ? 'Token configured' : 'Token missing'}
        </Badge>
      </header>

      {errors.length ? (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">{errors[0]}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Delivery cities" value={configured ? deliveryCities : '—'} />
        <Metric title="Pickup cities" value={configured ? pickupCities : '—'} />
        <Metric title="Pickup addresses" value={configured ? pickupRows.length : '—'} />
        <Metric title="Local shipments" value={localShipments.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Local PostEx shipments</CardTitle>
            <CardDescription>Last 25 consignments saved in Munasib.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Tracking</th>
                  <th className="px-4 py-2.5 font-medium">PostEx status</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {localShipments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No PostEx shipments have been booked yet.
                    </td>
                  </tr>
                ) : (
                  localShipments.map((shipment) => (
                    <tr key={shipment.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/admin/orders/${shipment.order.id}`}
                          className="hover:underline"
                        >
                          {shipment.order.orderNumber}
                        </Link>
                        <div className="mt-1">
                          <Badge variant="muted">{shipment.order.orderStatus}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {shipment.trackingNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {shipment.trackingStatusText ?? shipment.shipmentStatus}
                        </Badge>
                        {shipment.trackingJourney ? (
                          <div className="mt-1 max-w-[260px] text-xs text-muted-foreground">
                            {shipment.trackingJourney}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div>{shipment.order.shippingFullName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {shipment.order.shippingCity ?? '—'} · {shipment.order.paymentStatus}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {shipment.trackingSyncedAt
                          ? formatDate(shipment.trackingSyncedAt, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Pickup addresses</CardTitle>
              <CardDescription>Registered at PostEx.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {pickupRows.length === 0 ? (
                <p className="text-muted-foreground">
                  {configured ? 'No pickup address returned.' : 'Connect the production token.'}
                </p>
              ) : (
                pickupRows.slice(0, 6).map((p) => (
                  <div
                    key={`${p.addressCode}-${p.address}`}
                    className="border-b border-border/60 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="font-medium">{p.contactPersonName || p.cityName}</div>
                    <div className="text-xs text-muted-foreground">{p.address}</div>
                    <div className="mt-1 font-mono text-xs">{p.addressCode}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reference values</CardTitle>
              <CardDescription>Types and statuses reported by PostEx.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <TagGroup title="Order types" items={orderTypes?.data ?? []} />
              <TagGroup title="Order statuses" items={orderStatuses?.data ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>

      <PostExDashboardClient configured={configured} today={today()} pickupAddresses={pickupRows} />
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function TagGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <Badge key={item} variant="muted">
              {item}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
