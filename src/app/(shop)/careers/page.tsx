import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Careers',
  description:
    'Join the Munasib team — we are building a practical home essentials brand and we are always looking for kindred spirits.',
  path: '/careers',
});

export default function CareersPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Careers"
          title="Build something beautiful with us."
          description="Munasib is a small, ambitious team that cares deeply about product quality, service, and the people we serve."
        />

        <div className="flex flex-col gap-6 text-pretty leading-relaxed text-muted-foreground">
          <p>
            We hire for curiosity and care. Whether you come from retail, logistics, technology, or
            something else entirely, what matters most is the way you think about quality and the
            people around you.
          </p>
          <p>
            We do not have any open roles posted right now, but we are always glad to meet talented
            people. If Munasib speaks to you, we would love to hear from you.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Get in touch</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Send your CV and a short note about what draws you to Munasib to{' '}
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
