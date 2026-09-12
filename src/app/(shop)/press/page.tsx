import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Press',
  description:
    'Press resources and media enquiries for Munasib — our story, assets, and contacts in one place.',
  path: '/press',
});

export default function PressPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Press"
          title="In the press"
          description="For interviews, features, and product loans, our press team is happy to help."
        />

        <div className="flex flex-col gap-6 text-pretty leading-relaxed text-muted-foreground">
          <p>
            Munasib is a home essentials brand founded in Karachi, built on tested products and a
            practical point of view. We welcome conversations with editors, reviewers, and
            storytellers who share our love of craft.
          </p>
          <p>
            High-resolution imagery, brand assets, and founder background are available on request.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Media enquiries</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Reach our press team at{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={`mailto:${siteConfig.contact.email}`}
            >
              {siteConfig.contact.email}
            </a>{' '}
            and we will respond within two business days.
          </p>
        </div>
      </div>
    </Section>
  );
}
