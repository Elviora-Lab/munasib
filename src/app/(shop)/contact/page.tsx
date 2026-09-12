import Link from 'next/link';

import { siteConfig } from '@/config/site';

import { webPageJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';
import { ContactLink } from '@/components/analytics/pixel-trackers';

const DESCRIPTION =
  'Contact Munasib — email, phone and WhatsApp support for orders, delivery and returns anywhere in Pakistan. We reply within one business day.';

export const metadata = buildMetadata({
  title: 'Contact Munasib — Customer Support in Pakistan',
  description: DESCRIPTION,
  path: '/contact',
});

export default function ContactPage() {
  const { contact, business, policy } = siteConfig;
  // wa.me needs the number in international format with no +, spaces, or dashes.
  const waHref = `https://wa.me/${contact.phone.replace(/\D/g, '')}`;

  return (
    <Section>
      {/* A reachable, specific business is the strongest trust signal a
          cash-on-delivery store can send — to shoppers and to Google. */}
      <JsonLd
        data={webPageJsonLd({
          type: 'ContactPage',
          name: `Contact ${siteConfig.name}`,
          description: DESCRIPTION,
          path: '/contact',
        })}
      />
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Customer care"
          title="We would love to hear from you."
          description="A question about a product, an order on its way, or a return — our team is happy to help."
        />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Email us</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Write to{' '}
            <ContactLink
              className="font-medium text-foreground underline underline-offset-4"
              href={`mailto:${contact.email}`}
            >
              {contact.email}
            </ContactLink>{' '}
            and a member of our customer care team will reply within one business day.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Call or WhatsApp</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Reach us on{' '}
            <ContactLink
              className="font-medium text-foreground underline underline-offset-4"
              href={`tel:${contact.phone.replace(/\s/g, '')}`}
            >
              {contact.phone}
            </ContactLink>{' '}
            during care hours, or message the same number on{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={waHref}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>{' '}
            any time — it is usually the fastest way to get an answer about an order.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Order help</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Every order is confirmed by email with a tracking link once it is dispatched — reply to
            that email, or send us your order number, and we will pick it up from there. Delivery
            times, courier charges, and our {policy.returnDays}-day returns window are set out on
            our{' '}
            <Link
              className="font-medium text-foreground underline underline-offset-4"
              href="/shipping"
            >
              shipping &amp; returns
            </Link>{' '}
            page, and the most common questions are answered in the{' '}
            <Link className="font-medium text-foreground underline underline-offset-4" href="/faq">
              FAQ
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>Customer care hours: Monday to Saturday, 10am to 7pm (PKT).</p>
          <p>
            Munasib ships from {business.city}, {business.region}, to every province in{' '}
            {business.countryName}. We trade online only at{' '}
            {siteConfig.url.replace(/^https?:\/\//, '')} — there is no walk-in store.
          </p>
        </div>
      </div>
    </Section>
  );
}
