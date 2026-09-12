import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

export const metadata = buildMetadata({
  title: 'Sustainability',
  description:
    'How Munasib approaches responsible retail — durable products, thoughtful packaging, and steady progress.',
  path: '/sustainability',
});

export default function SustainabilityPage() {
  return (
    <Section>
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Our promise"
          title="Buy once, buy well."
          description="The most responsible product is the one you do not have to replace. We are not perfect — but durability, honest packaging, and steady progress are what we hold ourselves to."
        />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Our commitments</h2>
          <ul className="flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Thoughtful packaging.</span> We favour
              recyclable and refillable materials and ship with minimal, plastic-free protection.
            </li>
            <li>
              <span className="font-medium text-foreground">Honest sourcing.</span> We work with
              suppliers who meet our standards for quality and ethics.
            </li>
            <li>
              <span className="font-medium text-foreground">Measured buying.</span> We are a
              retailer, not a manufacturer — we order in small, measured batches so we are not
              sitting on overstock that ends up discounted into landfill.
            </li>
            <li>
              <span className="font-medium text-foreground">Products built to last.</span> We favour
              items that survive daily use over cheaper versions that get replaced twice a year.
            </li>
          </ul>
        </div>

        <p className="text-pretty leading-relaxed text-muted-foreground">
          Sustainability is a journey rather than a destination. We will keep sharing our progress
          openly as our practices evolve.
        </p>
      </div>
    </Section>
  );
}
