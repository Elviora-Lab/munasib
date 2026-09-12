import Link from 'next/link';
import { ArrowRight, Check, Tag, Truck } from 'lucide-react';

import { cn } from '@/lib/cn';

import { Reveal } from '@/design-system/primitives/reveal';
import { SectionHeading } from '@/design-system/primitives/section';
import { SnapRail } from '@/components/commerce/snap-rail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type LadderTier = { minSubtotal: number; discountAmount: number };

const fmt = (n: number) => `Rs ${n.toLocaleString('en-US')}`;

// Alternating tilt for the ticket row — the same "scattered, not aligned"
// language as the hero's photo cluster, so the two sections read as one
// brand rather than two different design systems glued together.
const TILTS = ['-rotate-3', 'rotate-3', '-rotate-3', 'rotate-3'];

/**
 * Spend & Save — a hand of reward "tickets" instead of a technical stepper.
 * There is no live cart total to track here (this renders before the cart,
 * illustrating the published policy), so a progress-bar metaphor was always
 * slightly dishonest about what it was showing — a stepper implies "you are
 * here," when really every tier is just an unlock waiting to happen. A row
 * of coupon-style tickets (the same dashed-border language as the WELCOME10
 * chip elsewhere on the page) reads as "collect these," which is what's
 * actually true.
 */
export function SavingsLadder({
  tiers,
  freeDeliveryAt = 3300,
}: {
  tiers: LadderTier[];
  freeDeliveryAt?: number;
}) {
  const steps = tiers.slice(0, 4);
  if (steps.length === 0) return null;
  const maxSave = Math.max(...steps.map((t) => t.discountAmount));

  const tickets = [
    ...steps.map((t, i) => (
      <Ticket
        key={t.minSubtotal}
        spend={t.minSubtotal}
        save={t.discountAmount}
        tilt={TILTS[i % TILTS.length] ?? 'rotate-0'}
      />
    )),
    <SummitTicket key="summit" freeDeliveryAt={freeDeliveryAt} />,
  ];

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-4">
        <SectionHeading
          eyebrow="Spend & Save"
          title="Bigger basket, bigger discount."
          description={`Automatic at checkout — no code needed. Save up to ${fmt(maxSave)}, and cross ${fmt(freeDeliveryAt)} for free delivery.`}
        />
        <Badge
          variant="info"
          className="inline-flex w-fit items-center gap-1.5 border border-accent/30 bg-card text-accent"
        >
          <Check className="size-3.5" /> Applied automatically at checkout
        </Badge>
        <p className="text-sm text-muted-foreground">
          The more your basket holds, the more comes off — stacked automatically on every order.
        </p>
        <div>
          <Button asChild variant="outline" size="md">
            <Link href="/products">
              Build your basket <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Desktop: a fanned row of ticket cards. */}
      <div className="hidden flex-wrap items-center justify-center gap-x-3 gap-y-6 lg:flex xl:gap-x-4">
        {tickets.map((ticket, i) => (
          <Reveal key={i} inView delay={i * 0.08}>
            {ticket}
          </Reveal>
        ))}
      </div>

      {/* Mobile: same tickets, in a snap rail. */}
      <div className="lg:hidden">
        <SnapRail ariaLabel="Spend and save tiers" itemClassName="w-40">
          {tickets.map((ticket, i) => (
            <div key={i} className="pt-3">
              {ticket}
            </div>
          ))}
        </SnapRail>
      </div>
    </div>
  );
}

/** One spend/save reward ticket — a coupon, not a stepper node. */
function Ticket({ spend, save, tilt }: { spend: number; save: number; tilt: string }) {
  return (
    <div
      className={cn(
        'relative flex w-36 shrink-0 flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-accent/40 bg-card px-4 py-4 text-center shadow-soft',
        'transition-transform duration-300 ease-swift hover:-translate-y-1 hover:rotate-0 hover:shadow-card',
        tilt,
      )}
    >
      <span className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent">
        <Tag className="size-4" />
      </span>
      <span className="text-xs text-muted-foreground">Spend {fmt(spend)}</span>
      <span className="text-lg font-semibold tabular-nums text-accent">save {fmt(save)}</span>
    </div>
  );
}

/** The final ticket — free delivery, the grand prize, visually set apart. */
function SummitTicket({ freeDeliveryAt }: { freeDeliveryAt: number }) {
  return (
    <div className="relative flex w-40 shrink-0 -rotate-2 flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-white/40 bg-gradient-ember px-4 py-5 text-center text-white shadow-pop transition-transform duration-300 ease-swift hover:-translate-y-1 hover:rotate-0">
      <span className="grid size-10 place-items-center rounded-full bg-white/20">
        <Truck className="size-5" />
      </span>
      <span className="text-xs text-white/85">Cross {fmt(freeDeliveryAt)}</span>
      <span className="text-lg font-bold">Free delivery</span>
    </div>
  );
}
