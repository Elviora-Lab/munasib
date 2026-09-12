import Link from 'next/link';

import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Shipping & Returns',
  description:
    'Delivery times, shipping costs, and our 2 to 3 day returns policy for orders across Pakistan.',
  path: '/shipping',
});

export default function ShippingPage() {
  const whatsapp = siteConfig.contact.phone;
  const freeShippingOver = siteConfig.policy.freeShippingOver.toLocaleString('en-US');
  // wa.me needs the number in international format with no +, spaces, or dashes.
  const waHref = `https://wa.me/${whatsapp.replace(/\D/g, '')}`;

  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Delivery"
          title="Shipping & returns"
          description="Everything you need to know about getting Munasib to your door — and sending it back if it is not quite right."
        />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Shipping</h2>
          <ul className="flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
            <li>Nationwide delivery across Pakistan in 2 to 5 business days.</li>
            <li>Free shipping on orders over Rs {freeShippingOver}.</li>
            <li>Below that, Karachi delivery is a flat Rs 200.</li>
            <li>Sindh and all other provinces are a flat Rs 220.</li>
            <li>The exact amount is always shown at checkout before you place the order.</li>
            <li>Orders are processed within 24 hours, Monday to Saturday.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Returns</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            We want you to love what you receive. Unopened products may be returned within 2 to 3
            days of delivery for a full refund to your original payment method. For hygiene reasons,
            used items cannot be returned unless faulty.
          </p>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            To start a return, email{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={`mailto:${siteConfig.contact.email}`}
            >
              {siteConfig.contact.email}
            </a>{' '}
            or message us on WhatsApp at{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {whatsapp}
            </a>{' '}
            with your order number, and we will guide you through the next steps.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Have a question first? Message us on WhatsApp at{' '}
          <a
            className="text-foreground underline underline-offset-4"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {whatsapp}
          </a>
          , visit our{' '}
          <Link className="text-foreground underline underline-offset-4" href="/faq">
            FAQ
          </Link>
          , or{' '}
          <Link className="text-foreground underline underline-offset-4" href="/contact">
            contact us
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}
