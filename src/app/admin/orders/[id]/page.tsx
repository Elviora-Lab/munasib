import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate, formatMoney } from '@/utils/format';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { CourierCard } from './courier-card';
import { CustomerCard } from './customer-card';
import { OrderItems } from './order-items';
import { PaymentActions } from './payment-actions';
import { StatusUpdater } from './status-updater';

import { adminOrdersRepo } from '@/server/repositories/admin.repo';
import { isPostExConfigured } from '@/server/shipping/postex';

export const metadata = buildMetadata({ title: 'Admin · Order', noIndex: true });
export const dynamic = 'force-dynamic';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await adminOrdersRepo.findById(id);
  if (!order) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="editorial-heading font-mono text-display-md">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {formatDate(order.createdAt, { dateStyle: 'long' })}
          </p>
        </div>
        <Link
          href="/admin/orders"
          className="text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
        >
          ← All orders
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderItems
                currency={order.currency}
                subtotal={Number(order.subtotal)}
                shippingFee={Number(order.shippingFee)}
                taxAmount={Number(order.taxAmount)}
                discountAmount={Number(order.discountAmount)}
                discountLabel={order.discountLabel}
                totalAmount={Number(order.totalAmount)}
                items={order.items.map((item) => ({
                  id: item.id,
                  productName: item.productName,
                  variantName: item.variantName,
                  quantity: item.quantity,
                  unitPrice: Number(item.unitPrice),
                  totalPrice: Number(item.totalPrice),
                  product: item.product
                    ? {
                        slug: item.product.slug,
                        imageUrl: item.product.images[0]?.imageUrl ?? null,
                      }
                    : null,
                  variant: item.variant
                    ? {
                        sku: item.variant.sku,
                        size: item.variant.size,
                        shade: item.variant.shade,
                        fragrance: item.variant.fragrance,
                        imageUrl: item.variant.images[0]?.imageUrl ?? null,
                      }
                    : null,
                }))}
              />
            </CardContent>
          </Card>

          {order.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Status history</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3 text-sm">
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-4">
                    <div>
                      <Badge variant="muted">{h.status}</Badge>
                      {h.note ? (
                        <div className="mt-1 text-xs text-muted-foreground">{h.note}</div>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(h.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Current status</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusUpdater orderId={order.id} currentStatus={order.orderStatus} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipping</CardTitle>
            </CardHeader>
            <CardContent>
              <CourierCard
                orderId={order.id}
                configured={isPostExConfigured()}
                shipment={
                  order.shipments[0]
                    ? {
                        courierName: order.shipments[0].courierName,
                        trackingNumber: order.shipments[0].trackingNumber,
                        shipmentStatus: order.shipments[0].shipmentStatus,
                        trackingStatusText: order.shipments[0].trackingStatusText,
                        trackingJourney: order.shipments[0].trackingJourney,
                        trackingSyncedAt: order.shipments[0].trackingSyncedAt,
                        labelPrintedAt: order.shipments[0].labelPrintedAt,
                        packedAt: order.shipments[0].packedAt,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer &amp; delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerCard
                account={
                  order.user
                    ? {
                        id: order.user.id,
                        email: order.user.email,
                        firstName: order.user.firstName,
                        lastName: order.user.lastName,
                      }
                    : null
                }
                shipping={{
                  fullName: order.shippingFullName,
                  email: order.shippingEmail,
                  phone: order.shippingPhone,
                  addressLine1: order.shippingAddressLine1,
                  addressLine2: order.shippingAddressLine2,
                  area: order.shippingArea,
                  city: order.shippingCity,
                  postalCode: order.shippingPostalCode,
                  country: order.shippingCountry,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div>
                <Badge variant={order.paymentStatus === 'PAID' ? 'success' : 'muted'}>
                  {order.paymentStatus}
                </Badge>
              </div>
              {order.payments.length === 0 ? (
                <p className="text-muted-foreground">No payment attempts recorded.</p>
              ) : (
                <ul className="text-xs text-muted-foreground">
                  {order.payments.map((p) => (
                    <li key={p.id}>
                      {p.paymentMethod} — {formatMoney(Number(p.amount), order.currency)} (
                      {p.paymentStatus})
                    </li>
                  ))}
                </ul>
              )}
              {order.paymentStatus !== 'PAID' &&
              order.paymentStatus !== 'REFUNDED' &&
              order.paymentStatus !== 'PARTIALLY_REFUNDED' ? (
                <PaymentActions orderId={order.id} />
              ) : null}
            </CardContent>
          </Card>

          {order.utmSource || order.utmMedium || order.utmCampaign ? (
            <Card>
              <CardHeader>
                <CardTitle>Came from</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {order.utmSource ? (
                  <div>
                    <span className="text-muted-foreground">Source </span>
                    {order.utmSource}
                  </div>
                ) : null}
                {order.utmMedium ? (
                  <div>
                    <span className="text-muted-foreground">Medium </span>
                    {order.utmMedium}
                  </div>
                ) : null}
                {order.utmCampaign ? (
                  <div>
                    <span className="text-muted-foreground">Campaign </span>
                    {order.utmCampaign}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
