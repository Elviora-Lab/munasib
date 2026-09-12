import { siteConfig } from '@/config/site';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Privacy Policy',
  description: 'How Munasib collects, uses, and protects your personal information.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Legal"
          title="Privacy policy"
          description="Your trust matters to us. This policy explains what we collect and how we use it."
        />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Information we collect</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            We collect information you provide when you create an account, place an order, or
            contact us — such as your name, email, delivery address, and order history. We also
            collect limited technical data, like your device and browsing activity on our site, to
            keep it running smoothly.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">How we use it</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            We use your information to process orders, provide client care, improve our products and
            experience, and — only with your consent — to send you updates about Munasib. We never
            sell your personal data.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Your choices</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            You may access, correct, or request deletion of your personal data at any time, and you
            can unsubscribe from marketing emails with a single click.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Contact</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Questions about your privacy? Email{' '}
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
