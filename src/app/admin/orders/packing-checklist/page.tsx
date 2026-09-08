import { Fragment } from 'react';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { buildMetadata } from '@/lib/seo/metadata';

import { AutoPrint } from '../labels/_components/auto-print';
import { type LabelOrder, ShippingLabel } from '../labels/_components/shipping-label';
import { type ChecklistOrder, PackingChecklist } from './_components/packing-checklist';

import './print.css';

import { requireAdmin } from '@/server/auth/guards';

export const metadata = buildMetadata({
  title: 'Admin · Pack + shipping label',
  noIndex: true,
});
export const dynamic = 'force-dynamic';

type Search = Promise<{ ids?: string }>;

/**
 * Paired kitchen print: for each order, packing checklist then shipping label.
 * Stack comes out as bill → label → bill → label so packers stay matched.
 * Stamps labelPrintedAt (shipping label half of the pair).
 */
export default async function PackingChecklistPage({ searchParams }: { searchParams: Search }) {
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
    include: {
      items: { orderBy: { id: 'asc' } },
      shipments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      payments: { take: 1 },
    },
  });

  const byId = new Map(rows.map((o) => [o.id, o]));
  const ordered = orderIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;

  const { stampLabelsPrintedForOrders } =
    await import('@/server/services/fulfillment-print.service');
  await stampLabelsPrintedForOrders(orderIds, session.sub);

  const packs = ordered.map((o) => {
    const checklist: ChecklistOrder = {
      id: o.id,
      orderNumber: o.orderNumber,
      totalAmount: Number(o.totalAmount),
      currency: o.currency,
      shippingFullName: o.shippingFullName,
      items: o.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        totalPrice: Number(i.totalPrice),
      })),
    };

    const label: LabelOrder = {
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
    };

    return { checklist, label };
  });

  return (
    <>
      <AutoPrint count={packs.length} noun="paired pack" />
      <main className="pack-print-root mx-auto max-w-[210mm] py-6 print:max-w-none print:py-0">
        {packs.map(({ checklist, label }) => (
          <Fragment key={checklist.id}>
            <PackingChecklist order={checklist} />
            <ShippingLabel order={label} />
          </Fragment>
        ))}
      </main>
    </>
  );
}
