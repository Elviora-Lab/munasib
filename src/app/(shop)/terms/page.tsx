import Link from 'next/link';

import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Terms of Service',
  description: 'The terms that govern your use of the Munasib storefront and your purchases.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Legal"
          title="Terms of service"
          description="Please read these terms carefully. By using our site or placing an order, you agree to them."
        />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Using our site</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            You may browse and shop Munasib for personal, non-commercial use. You agree not to
            misuse the site, interfere with its operation, or attempt to access it in any
            unauthorised way.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Orders and pricing</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            All prices are listed in Pakistani Rupees (Rs) and may change without notice. We reserve
            the right to refuse or cancel any order, for example where an item is mispriced or out
            of stock. Returns are handled under our{' '}
            <Link className="text-foreground underline underline-offset-4" href="/shipping">
              shipping &amp; returns
            </Link>{' '}
            policy.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Intellectual property</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            All content on this site — including text, imagery, and the Munasib name and marks —
            belongs to Munasib and may not be used without our written permission.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Contact</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            For any questions about these terms, email{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={`mailto:${siteConfig.contact.email}`}
            >
              {siteConfig.contact.email}
            </a>
            .
          </p>
        </div>
      </div>
    </Section>
  );
}
