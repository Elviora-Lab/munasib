import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';
import { SkincareViewTracker } from '@/components/analytics/pixel-trackers';
import { Button } from '@/components/ui/button';

import { SkinQuiz } from './skin-quiz';

// Carried over from the beauty catalog this storefront was forked from. The
// route is orphaned (nothing links to it, it is not in the sitemap) but was
// still indexable — a "skincare"/"beauty" URL on a kitchenware domain dilutes
// the site's topical relevance. Kept reachable for the existing quiz flow,
// excluded from search.
export const metadata = buildMetadata({
  title: 'Beauty Concierge',
  description:
    'Get one-to-one product guidance from the Munasib team — tell us about your home and we will point you to the right tools.',
  path: '/ai-skincare-assistant',
  noIndex: true,
});

export default function BeautyConciergePage() {
  return (
    <Section>
      <SkincareViewTracker />
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Beauty Concierge"
          title="A consultation, made personal."
          description="Some choices are easier with a guide. Our Beauty Concierge offers thoughtful, one-to-one advice to help you find your perfect match."
        />

        <div className="flex flex-col gap-6 text-pretty leading-relaxed text-muted-foreground">
          <p>
            Tell us about your routine, your preferences, and what you are hoping to find. Take our
            quick match quiz below for a personalised edit — or book a one-to-one consultation with
            our team.
          </p>
        </div>

        {/* Lead-magnet quiz: captures skin type + concerns + email, fires Meta Lead */}
        <SkinQuiz />

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">What to expect</h2>
          <ul className="flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
            <li>A relaxed conversation about your goals and current routine.</li>
            <li>Tailored product suggestions across the Munasib range.</li>
            <li>Honest advice — including when something is not right for you.</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/contact">Book a consultation</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/products">Explore the collection</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
