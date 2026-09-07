import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { buildMetadata } from '@/lib/seo/metadata';

import { AutoPrint } from './_components/auto-print';
import { type LabelOrder, ShippingLabel } from './_components/shipping-label';

import './print.css';

import { requireAdmin } from '@/server/auth/guards';

export const metadata = buildMetadata({ title: 'Admin · Print labels', noIndex: true });
export const dynamic = 'force-dynamic';

type Search = Promise<{ ids?: string }>;

export default async function PrintLabelsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireAdmin();

  const { ids } = await searchParams;
  const orderIds = (ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (orderIds.length === 0) {
    redirect('/admin/orders');
  }

  const rows = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      shipments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      payments: { take: 1 },
    },
  });

  const { stampLabelsPrintedForOrders } =
    await import('@/server/services/fulfillment-print.service');
  await stampLabelsPrintedForOrders(orderIds, session.sub);

  // Project Prisma rows to the plain `LabelOrder` shape the printable component expects.
  const orders: LabelOrder[] = rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    totalAmount: Number(o.totalAmount),
    currency: o.currency,
    notes: o.notes,
    shippingFullName: o.shippingFullName,
    shippingPhone: o.shippingPhone,
    shippingCountry: o.shippingCountry,
    shippingCity: o.shippingCity,
    shippingArea: o.shippingArea,
    shippingAddressLine1: o.shippingAddressLine1,
    shippingAddressLine2: o.shippingAddressLine2,
    shippingPostalCode: o.shippingPostalCode,
    items: o.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
    })),
    shipments: o.shipments.map((s) => ({
      courierName: s.courierName,
      trackingNumber: s.trackingNumber,
    })),
    payments: o.payments.map((p) => ({
      paymentMethod: p.paymentMethod,
      paymentStatus: p.paymentStatus,
    })),
  }));

  return (
    <>
      <AutoPrint count={orders.length} />
      <main className="labels-root mx-auto max-w-[210mm] py-6 print:max-w-none print:py-0">
        {orders.map((order) => (
          <ShippingLabel key={order.id} order={order} />
        ))}
      </main>
    </>
  );
}
