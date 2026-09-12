import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';
import { Button } from '@/components/ui/button';

export const metadata = buildMetadata({
  title: 'Gift Cards',
  description:
    'Give the gift of choice with a Munasib gift card — useful for every kitchen, cupboard, and corner of the house.',
  path: '/gift-cards',
});

export default function GiftCardsPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="The perfect gift"
          title="Munasib gift cards"
          description="When you are not sure which one they would pick, give the choice instead. Our gift cards never expire and work on anything in the store."
        />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">How it works</h2>
          <ul className="flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
            <li>Available in denominations from Rs 2,500 to Rs 25,000.</li>
            <li>Delivered digitally by email, ready to forward to the lucky recipient.</li>
            <li>Redeemable on every product and never expires.</li>
            <li>Apply the code at checkout — any unused balance stays on the card.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Gift cards are coming soon to the Munasib storefront. In the meantime, our support team
            can arrange one for you directly.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/contact">Request a gift card</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/products">Browse the collection</Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
