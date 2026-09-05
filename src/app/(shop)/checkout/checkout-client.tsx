'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Lock, Phone, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { useAppSelector } from '@/store/hooks';

import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { bestDiscount } from '@/lib/promotions';
import { CHEAPEST_ZONE, computeCheckoutTotals } from '@/lib/shipping';

import { EmptyState } from '@/design-system/primitives/empty-state';
import { Price } from '@/design-system/primitives/price';
import { FlashSaleNotice } from '@/components/commerce/flash-sale-notice';
import { PostExCityCombobox } from '@/components/commerce/postex-city-combobox';
import { TrustBar } from '@/components/commerce/trust-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useCart } from '@/features/cart/hooks/use-cart';
import { selectCart } from '@/features/cart/store/cart-slice';
import { RewardsLadder } from '@/features/promotions/components/rewards-ladder';
import { useSpendDiscount } from '@/features/promotions/hooks/use-spend-discount';

import { placeOrder } from '@/server/actions/checkout.actions';

type Address = {
  id: string;
  fullName: string;
  phone: string | null;
  country: string;
  city: string;
  area: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  isDefault: boolean;
};

type CartProp = {
  lines: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    unitPrice: number;
    /** Pre-sale price — present only on flash-sale lines. */
    originalPrice?: number;
    quantity: number;
    currency: string;
  }>;
  subtotal: number;
  currency: string;
  /** Set when the live flash sale discounts at least one line. */
  flashSale?: { title: string; endsAt: string } | null;
};

type PaymentMethod = 'COD' | 'CARD';

export function CheckoutClient({
  addresses,
  cart,
  deliveryCities,
}: {
  addresses: Address[];
  cart: CartProp;
  deliveryCities: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { clear: clearLocalCart, cart: clientCart } = useCart();
  const { couponCode, couponDiscount } = useAppSelector(selectCart);
  const { spendDiscount } = useSpendDiscount(cart.subtotal);
  // Best-single-wins (matches the server's order-time calculation).
  const { amount: discount, source } = bestDiscount(couponDiscount ?? 0, spendDiscount);
  const discountLabel =
    source === 'spend' ? 'Spend & Save' : couponCode ? `Coupon ${couponCode}` : 'Discount';

  const initialAddressId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? 'new';
  const [addressId, setAddressId] = useState<string>(initialAddressId);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState('');

  const [newAddress, setNewAddress] = useState({
    fullName: '',
    phone: '',
    country: 'PK', // Pakistan by default — no country picker on the form.
    city: '',
    area: '', // used for the "Nearby" landmark field
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    isDefault: addresses.length === 0,
  });

  // Live shipping estimate. Destination city comes from the selected saved
  // address or the new-address form; both update the quote as the customer
  // changes them. Uses the same helper as the server, so the quote equals the
  // charged total.
  const destinationCity =
    addressId === 'new' ? newAddress.city : (addresses.find((a) => a.id === addressId)?.city ?? '');
  const totalQuantity = cart.lines.reduce((sum, l) => sum + l.quantity, 0);
  // Until a city is typed, quote the cheapest zone as an optimistic "from"
  // estimate rather than defaulting to the most expensive fallback zone. The
  // server ignores this override and charges from the real address.
  const cityChosen = destinationCity.trim().length > 0;
  const totals = computeCheckoutTotals({
    subtotal: cart.subtotal,
    discount,
    city: destinationCity,
    quantity: totalQuantity,
    paymentMethod,
    zone: cityChosen ? undefined : CHEAPEST_ZONE,
  });
  const total = totals.total;

  // Non-blocking PostEx serviceability check. `false` = PostEx doesn't deliver
  // to this city (we warn but still let them order — they may prefer another
  // courier); `null` = unknown, so no warning. Debounced to avoid a request per
  // keystroke; the endpoint is cached server-side.
  const [cityServiceable, setCityServiceable] = useState<boolean | null>(null);
  useEffect(() => {
    const city = destinationCity.trim();
    if (city.length < 2) {
      setCityServiceable(null);
      return;
    }
    if (deliveryCities.length > 0) {
      setCityServiceable(
        deliveryCities.some((c) => c.toLowerCase() === city.toLowerCase()) ? true : false,
      );
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/v1/shipping/city-check?city=${encodeURIComponent(city)}`)
        .then((r) => r.json())
        .then((d) => setCityServiceable(typeof d.serviceable === 'boolean' ? d.serviceable : null))
        .catch(() => setCityServiceable(null));
    }, 500);
    return () => clearTimeout(timer);
  }, [destinationCity, deliveryCities]);

  // Analytics: fire begin-checkout + default payment method once when checkout
  // loads (Meta InitiateCheckout / AddPaymentInfo + GA4 begin_checkout).
  useEffect(() => {
    if (cart.lines.length === 0) return;
    const lineItems = cart.lines.map((l) => ({
      item_id: l.productId,
      item_name: l.name,
      price: l.unitPrice,
      quantity: l.quantity,
    }));
    analytics.beginCheckout({
      value: total,
      currency: cart.currency,
      count: totalQuantity,
      items: lineItems,
    });
    // COD is the default — shoppers who never click a payment tile still get
    // AddPaymentInfo (and its deduped CAPI twin) in the funnel.
    analytics.addPaymentInfo({
      value: total,
      currency: cart.currency,
      method: 'COD',
      items: lineItems,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        description="Add something you love before heading to checkout."
        action={
          <Button asChild>
            <Link href="/products">Browse the edit</Link>
          </Button>
        }
      />
    );
  }

  function choosePayment(method: PaymentMethod) {
    if (method === paymentMethod) return;
    setPaymentMethod(method);
    // Selecting a method is "adding payment info" for COD/bank. Pass line items
    // so the deduped CAPI twin carries Meta catalogue IDs for matching.
    analytics.addPaymentInfo({
      value: total,
      currency: cart.currency,
      method,
      items: cart.lines.map((l) => ({
        item_id: l.productId,
        item_name: l.name,
        price: l.unitPrice,
        quantity: l.quantity,
      })),
    });
  }

  function handlePlaceOrder() {
    const usingNewAddress = addressId === 'new';
    if (usingNewAddress) {
      if (!newAddress.fullName || !newAddress.addressLine1 || !newAddress.city) {
        toast.error('Please fill in full name, address and city');
        return;
      }
      if (!newAddress.phone) {
        toast.error('Please provide a phone number so we can reach you about delivery');
        return;
      }
      if (
        deliveryCities.length > 0 &&
        !deliveryCities.some((c) => c.toLowerCase() === newAddress.city.trim().toLowerCase())
      ) {
        toast.error('Please select your delivery city from the list');
        return;
      }
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Please enter a valid email address, or leave it blank');
      return;
    }

    // Feed the pixel Advanced Matching from the contact details we now have, so
    // the browser Purchase on the confirmation page scores high Event Match
    // Quality (the CAPI Purchase already sends these hashed server-side).
    const phone = usingNewAddress
      ? newAddress.phone
      : (addresses.find((a) => a.id === addressId)?.phone ?? '');
    analytics.identify({ email: trimmedEmail || undefined, phone: phone || undefined });

    // GA4 add_shipping_info — the delivery step of the checkout funnel.
    analytics.addShippingInfo({
      value: total,
      currency: cart.currency,
      shippingTier: 'Standard',
      coupon: clientCart.couponCode ?? undefined,
      items: cart.lines.map((l) => ({
        item_id: l.productId,
        item_name: l.name,
        price: l.unitPrice,
        quantity: l.quantity,
      })),
    });

    start(async () => {
      const result = await placeOrder({
        ...(usingNewAddress ? { address: newAddress } : { addressId }),
        email: trimmedEmail || undefined,
        paymentMethod,
        notes: notes || undefined,
        couponCode: clientCart.couponCode ?? undefined,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      clearLocalCart();
      toast.success('Order placed');
      router.push(`/checkout/success/${result.data.orderId}`);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        {/* Shipping address */}
        <Card>
          <CardHeader>
            <CardTitle>Shipping address</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Email for order updates (optional)">
              <Input
                type="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                We send the order confirmation and shipping updates here.
              </p>
            </Field>

            {addresses.length > 0 ? (
              <div className="flex flex-col gap-2">
                {addresses.map((a) => (
                  <AddressRadio
                    key={a.id}
                    address={a}
                    active={addressId === a.id}
                    onSelect={() => setAddressId(a.id)}
                  />
                ))}
                <AddressNewRadio
                  active={addressId === 'new'}
                  onSelect={() => setAddressId('new')}
                />
              </div>
            ) : null}

            {addressId === 'new' ? (
              <div className="grid gap-4 rounded-md border border-border bg-muted/30 p-4 md:grid-cols-2">
                <Field label="Full name *">
                  <Input
                    value={newAddress.fullName}
                    onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                  />
                </Field>
                <Field label="Phone *">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={newAddress.phone}
                    onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                  />
                </Field>
                <Field label="City *">
                  <PostExCityCombobox
                    cities={deliveryCities}
                    value={newAddress.city}
                    onChange={(city) => setNewAddress({ ...newAddress, city })}
                  />
                </Field>
                <Field label="Postal code">
                  <Input
                    value={newAddress.postalCode}
                    onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                  />
                </Field>
                <Field label="Address *" className="md:col-span-2">
                  <Input
                    placeholder="House / street / area"
                    value={newAddress.addressLine1}
                    onChange={(e) => setNewAddress({ ...newAddress, addressLine1: e.target.value })}
                  />
                </Field>
                <Field label="Nearby (landmark)" className="md:col-span-2">
                  <Input
                    placeholder="e.g. near Allah Wala Chowk"
                    value={newAddress.area}
                    onChange={(e) => setNewAddress({ ...newAddress, area: e.target.value })}
                  />
                </Field>
                {addresses.length > 0 ? (
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      checked={newAddress.isDefault}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, isDefault: e.target.checked })
                      }
                      className="size-4 rounded border-border accent-foreground"
                    />
                    Make this my default address
                  </label>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Payment method */}
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <PaymentOption
              active={paymentMethod === 'COD'}
              onSelect={() => choosePayment('COD')}
              title="Cash on delivery"
              hint="Pay when your order arrives. Available in supported regions."
            />
          </CardContent>
        </Card>

        {/* Order notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Anything we should know about your delivery?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Order summary */}
      <aside className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-6 lg:sticky lg:top-24">
        <h2 className="font-serif text-2xl font-light">Order summary</h2>
        <ul className="flex flex-col gap-3 text-sm">
          {cart.lines.map((l) => (
            <li key={`${l.productId}-${l.variantId}`} className="flex justify-between gap-2">
              <span className="line-clamp-1 text-muted-foreground">
                {l.name} × {l.quantity}
              </span>
              <Price amount={l.unitPrice * l.quantity} currency={l.currency} size="sm" />
            </li>
          ))}
        </ul>
        <div className="soft-divider" />
        {cart.flashSale ? (
          <FlashSaleNotice
            title={cart.flashSale.title}
            endsAt={cart.flashSale.endsAt}
            savings={cart.lines.reduce(
              (sum, l) =>
                sum + (l.originalPrice ? (l.originalPrice - l.unitPrice) * l.quantity : 0),
              0,
            )}
            currency={cart.currency}
          />
        ) : null}
        <RewardsLadder subtotal={cart.subtotal} currency={cart.currency} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <Price amount={cart.subtotal} currency={cart.currency} size="sm" />
        </div>
        {discount > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{discountLabel}</span>
            <span className="tabular-nums text-success">
              −<Price amount={discount} currency={cart.currency} size="sm" />
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          {totals.freeShipping ? (
            <span className="font-medium uppercase tracking-wide text-emerald-600">Free</span>
          ) : (
            <span className="tabular-nums">
              {cityChosen ? null : <span className="text-muted-foreground">from </span>}
              <Price amount={totals.shippingFee} currency={cart.currency} size="sm" />
            </span>
          )}
        </div>
        {totals.taxAmount > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Tax{paymentMethod === 'COD' ? ' (incl. COD)' : ''}
            </span>
            <span className="tabular-nums">
              <Price amount={totals.taxAmount} currency={cart.currency} size="sm" />
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="eyebrow">Total</span>
          <span className="tabular-nums">
            {cityChosen || totals.freeShipping ? null : (
              <span className="text-sm text-muted-foreground">from </span>
            )}
            <Price amount={total} currency={cart.currency} size="lg" />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {cityChosen ? (
            totals.zone === 'within_city' ? (
              <>Karachi delivery is a flat Rs 200.</>
            ) : (
              <>Delivery to {destinationCity.trim()} is a flat Rs 220.</>
            )
          ) : (
            <>Starting from Karachi delivery — enter your city above to see the exact shipping.</>
          )}
        </p>
        {cityServiceable === false ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Our courier may not deliver to {destinationCity.trim() || 'this city'}. You can still
            place the order — we&apos;ll confirm delivery and reach out if there&apos;s any issue.
          </p>
        ) : null}
        <Button size="lg" variant="cta" uppercase loading={pending} onClick={handlePlaceOrder}>
          <Lock className="size-4" aria-hidden />
          Place COD order
        </Button>
        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Truck className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden />
            <span>Pay cash when the parcel reaches your door.</span>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Phone className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden />
            <span>We can call if the courier needs delivery confirmation.</span>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden />
            <span>Your order is checked before dispatch.</span>
          </div>
        </div>
        <TrustBar className="pt-1" />
      </aside>
    </div>
  );
}

// ---------------- helpers ----------------

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AddressRadio({
  address,
  active,
  onSelect,
}: {
  address: Address;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
        active ? 'border-foreground bg-muted/40' : 'border-border hover:border-foreground/40',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{address.fullName}</span>
        {address.isDefault ? <Badge variant="muted">Default</Badge> : null}
      </div>
      <span className="text-xs text-muted-foreground">
        {address.addressLine1}
        {address.addressLine2 ? `, ${address.addressLine2}` : ''}, {address.city}
        {address.area ? `, ${address.area}` : ''}, {address.country}
        {address.postalCode ? ` ${address.postalCode}` : ''}
      </span>
    </button>
  );
}

function AddressNewRadio({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-md border border-dashed p-3 text-left text-sm transition-colors',
        active ? 'border-foreground bg-muted/40' : 'border-border hover:border-foreground/40',
      )}
    >
      + Use a new address
    </button>
  );
}

function PaymentOption({
  active,
  onSelect,
  title,
  hint,
  disabled,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
        active ? 'border-foreground bg-muted/40' : 'border-border hover:border-foreground/40',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
