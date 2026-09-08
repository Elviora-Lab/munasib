import { siteConfig } from '@/config/site';

import { formatMoney } from '@/utils/format';

import { BrandLogo } from '@/components/brand/brand-logo';

/**
 * Kitchen packing checklist — one order per A4 page.
 * Header: Kitchenly logo · Table: # / product / price · Footer: total.
 */
export type ChecklistOrder = {
  id: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  shippingFullName: string | null;
  items: Array<{
    id: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
};

export function PackingChecklist({ order }: { order: ChecklistOrder }) {
  const lines = order.items.map((item, index) => {
    const title = [item.productName, item.variantName].filter(Boolean).join(' · ');
    return {
      key: item.id,
      serial: index + 1,
      name: item.quantity > 1 ? `${item.quantity}× ${title}` : title,
      price: item.totalPrice > 0 ? item.totalPrice : item.unitPrice * item.quantity,
    };
  });

  const linesTotal = lines.reduce((sum, line) => sum + line.price, 0);
  const total = order.totalAmount > 0 ? order.totalAmount : linesTotal;

  return (
    <article className="checklist-page flex flex-col font-sans text-black">
      <header className="flex items-center justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <BrandLogo variant="mark" size={44} />
          <div>
            <div className="text-[18pt] font-semibold leading-none tracking-tight">
              {siteConfig.name}
            </div>
            <div className="mt-1 text-[10pt] uppercase tracking-[0.16em] text-black/55">
              Packing checklist
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10pt] uppercase tracking-[0.16em] text-black/55">Order</div>
          <div className="font-mono text-[16pt] font-semibold tabular-nums">
            {order.orderNumber}
          </div>
          {order.shippingFullName ? (
            <div className="mt-0.5 max-w-[220px] truncate text-[11pt] text-black/70">
              {order.shippingFullName}
            </div>
          ) : null}
        </div>
      </header>

      <table className="mt-6 w-full border-collapse text-[12pt]">
        <thead>
          <tr className="border-b-2 border-black text-left text-[10pt] uppercase tracking-[0.14em]">
            <th className="w-[56px] pb-2 pr-3 font-semibold">#</th>
            <th className="pb-2 pr-3 font-semibold">Product</th>
            <th className="w-[120px] pb-2 text-right font-semibold">Price</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className="border-b border-black/20">
              <td className="py-2.5 pr-3 align-top font-mono tabular-nums text-black/70">
                {line.serial}
              </td>
              <td className="py-2.5 pr-3 align-top leading-snug">{line.name}</td>
              <td className="py-2.5 text-right align-top font-mono tabular-nums">
                {formatMoney(line.price, order.currency)}
              </td>
            </tr>
          ))}
          {lines.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-6 text-center italic text-black/50">
                No line items on this order.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black">
            <td colSpan={2} className="pt-4 text-[12pt] font-semibold uppercase tracking-[0.12em]">
              Total
            </td>
            <td className="pt-4 text-right font-mono text-[14pt] font-semibold tabular-nums">
              {formatMoney(total, order.currency)}
            </td>
          </tr>
        </tfoot>
      </table>
    </article>
  );
}
