import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Accessibility',
  description: 'Our commitment to making the Munasib experience usable and welcoming for everyone.',
  path: '/accessibility',
});

export default function AccessibilityPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Accessibility"
          title="A store for everyone."
          description="We want every visitor to move through Munasib with ease, whatever device or assistive technology they use."
        />

        <div className="flex flex-col gap-6 text-pretty leading-relaxed text-muted-foreground">
          <p>
            We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA. That
            means clear contrast, keyboard-friendly navigation, descriptive alternative text for
            imagery, and a structure that works well with screen readers.
          </p>
          <p>
            Accessibility is ongoing work. We review and improve our site regularly, and we welcome
            feedback that helps us do better.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Tell us how we can improve</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            If you encounter any barrier on our site, please email{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={`mailto:${siteConfig.contact.email}`}
            >
              {siteConfig.contact.email}
            </a>{' '}
            and we will do our best to help and to fix the issue.
          </p>
        </div>
      </div>
    </Section>
  );
}
