import { siteConfig } from '@/config/site';

import { formatDate, formatMoney } from '@/utils/format';

/**
 * Shipping label — one order per A4 page for office printers.
 *
 * Content follows the convention used by Pakistani courier integrations
 * (TCS, Leopards, M&P, PostEx) — recipient prominent, order ref + COD
 * callout top-right, sender / return small at the top.
 */
export type LabelOrder = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  totalAmount: number;
  currency: string;
  notes: string | null;
  shippingFullName: string | null;
  shippingPhone: string | null;
  shippingCountry: string | null;
  shippingCity: string | null;
  shippingArea: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingPostalCode: string | null;
  items: Array<{
    id: string;
    productName: string;
    variantName: string | null;
    quantity: number;
  }>;
  shipments: Array<{
    courierName: string;
    trackingNumber: string | null;
  }>;
  payments: Array<{
    paymentMethod: string;
    paymentStatus: string;
  }>;
};

export function ShippingLabel({ order }: { order: LabelOrder }) {
  const from = siteConfig.shippingFrom;
  const isCod = order.payments.some((p) => p.paymentMethod === 'COD');
  const tracking = order.shipments[0];

  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const recipientLines = [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    [order.shippingCity, order.shippingArea].filter(Boolean).join(', '),
    [order.shippingPostalCode, order.shippingCountry].filter(Boolean).join(' '),
  ].filter(Boolean) as string[];

  const senderLine = `${from.addressLine1}${from.addressLine2 ? `, ${from.addressLine2}` : ''}, ${from.city} ${from.postalCode}, ${from.country}`;

  return (
    <article className="label-page flex flex-col gap-5 font-sans">
      {/* Header — sender + order ref */}
      <header className="flex items-start justify-between border-b-2 border-black pb-4">
        <div className="text-[12pt] leading-tight">
          <div className="text-[10pt] uppercase tracking-[0.18em] text-black/55">From</div>
          <div className="text-[16pt] font-semibold">{siteConfig.name.toUpperCase()}</div>
          <div className="mt-1 text-[11pt]">{senderLine}</div>
          <div className="text-[11pt]">{from.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-[10pt] uppercase tracking-[0.18em] text-black/55">Order</div>
          <div className="font-mono text-[20pt] font-semibold tabular-nums">
            {order.orderNumber}
          </div>
          <div className="text-[11pt] text-black/70">{formatDate(order.createdAt)}</div>
        </div>
      </header>

      {/* COD pill */}
      {isCod ? (
        <div className="inline-block self-start border-2 border-black px-4 py-2 text-[16pt] font-bold uppercase tracking-[0.16em]">
          Cash on Delivery — {formatMoney(order.totalAmount, order.currency)}
        </div>
      ) : (
        <div className="inline-block self-start border border-black/40 px-4 py-2 text-[12pt] uppercase tracking-[0.12em]">
          Prepaid · {order.payments[0]?.paymentMethod ?? '—'}
        </div>
      )}

      {/* Recipient — the visual anchor of the label */}
      <section>
        <div className="text-[10pt] uppercase tracking-[0.18em] text-black/55">To</div>
        <div className="text-[28pt] font-bold leading-tight">{order.shippingFullName ?? '—'}</div>
        {order.shippingPhone ? (
          <div className="mt-1 text-[16pt] font-semibold">{order.shippingPhone}</div>
        ) : null}
        <address className="mt-2 text-[14pt] not-italic leading-[1.4]">
          {recipientLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </address>
      </section>

      {/* Items summary + tracking */}
      <section className="mt-auto flex items-end justify-between gap-6 border-t-2 border-black pt-4">
        <div className="flex-1">
          <div className="text-[10pt] uppercase tracking-[0.18em] text-black/55">Items</div>
          <ul className="mt-1 text-[12pt] leading-snug">
            {order.items.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.quantity}× {item.productName}
                {item.variantName ? ` · ${item.variantName}` : ''}
              </li>
            ))}
            {order.items.length > 8 ? (
              <li className="italic">+ {order.items.length - 8} more</li>
            ) : null}
          </ul>
          <div className="mt-2 text-[10pt] text-black/55">
            {order.items.length} SKU{order.items.length === 1 ? '' : 's'} · {itemCount} pieces
          </div>
        </div>

        <div className="ml-3 max-w-[50%] text-right">
          {tracking?.trackingNumber ? (
            <>
              <div className="text-[10pt] uppercase tracking-[0.18em] text-black/55">
                {tracking.courierName} · Tracking
              </div>
              <div className="font-mono text-[16pt] tabular-nums">{tracking.trackingNumber}</div>
              <Barcode value={tracking.trackingNumber} />
            </>
          ) : (
            <>
              <div className="text-[10pt] uppercase tracking-[0.18em] text-black/55">Ref</div>
              <div className="font-mono text-[16pt] tabular-nums">{order.orderNumber}</div>
              <Barcode value={order.orderNumber} />
            </>
          )}
        </div>
      </section>

      {order.notes ? (
        <div className="border-t border-dashed border-black/40 pt-2 text-[11pt] italic">
          Note: {order.notes}
        </div>
      ) : null}

      <footer className="flex justify-between text-[9pt] uppercase tracking-[0.18em] text-black/55">
        <span>{siteConfig.tagline}</span>
        <span>{siteConfig.url.replace(/^https?:\/\//, '')}</span>
      </footer>
    </article>
  );
}

/**
 * Visual barcode placeholder — solid vertical bars derived from the
 * tracking string's char codes. Not scan-grade Code-128 — for true
 * scannability swap in a real barcode lib (e.g. jsbarcode) on the server.
 */
function Barcode({ value }: { value: string }) {
  // Deterministic stripe widths so the same value renders the same bars.
  const bars = Array.from(value).flatMap((ch, i) => {
    const code = ch.charCodeAt(0);
    return [
      { w: 1 + (code % 3), key: `b${i}` },
      { w: 1 + ((code >> 2) % 2), key: `s${i}` },
    ];
  });
  return (
    <div className="mt-2 flex h-[48px] items-end justify-end gap-[1px]">
      {bars.map((b, i) => (
        <span
          key={b.key}
          style={{
            width: `${b.w}px`,
            height: '100%',
            background: i % 2 === 0 ? 'black' : 'transparent',
          }}
        />
      ))}
    </div>
  );
}
