import Link from 'next/link';

import { siteConfig } from '@/config/site';

import { webPageJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { buildMetadata } from '@/lib/seo/metadata';

import { Section, SectionHeading } from '@/design-system/primitives/section';

const DESCRIPTION =
  'Munasib is a Pakistan-based online store for practical home, kitchen and everyday essentials — who we are, what we stock, and how ordering works.';

export const metadata = buildMetadata({
  title: 'About Munasib — Home & Everyday Essentials in Pakistan',
  description: DESCRIPTION,
  path: '/about',
});

/**
 * The About page carries most of the site's entity weight: it is where Google
 * (and a first-time shopper deciding whether to hand over cash at the door)
 * confirms that a real, specific business stands behind the domain.
 *
 * It was previously inherited, unedited, from the cosmetics storefront this
 * project was forked from — it described developing "shades and textures" that
 * feel "effortless on the skin" for a store that sells shoe racks. That is a
 * direct contradiction of every other signal on the site.
 *
 * Two things it must do, given a similarly-named business on another domain:
 * state plainly WHICH Munasib this is (the .com.pk store, this catalog, this
 * market), and stay honest about breadth so the copy does not have to be
 * rewritten each time a category is added.
 */
export default function AboutPage() {
  const { business, policy } = siteConfig;

  return (
    <Section>
      <JsonLd
        data={webPageJsonLd({
          type: 'AboutPage',
          name: `About ${siteConfig.name}`,
          description: DESCRIPTION,
          path: '/about',
        })}
      />
      <div className="container flex max-w-3xl flex-col gap-12">
        <SectionHeading
          as="h1"
          eyebrow="Our story"
          title="Useful things, honestly priced."
          description="Munasib is a Pakistani online store for the practical products a household actually runs on — from the kitchen drawer to the wardrobe rail to the wall by the front door."
        />

        <div className="flex flex-col gap-6 text-pretty leading-relaxed text-muted-foreground">
          <p>
            We started with a narrow question: why is it so hard to buy the small, useful thing you
            need today? Not a luxury purchase — a chopper that survives a year, a rack that fits
            under the sink, a hanger that makes a cupboard hold twice as much. Those products
            existed, but finding a trustworthy one online in Pakistan meant sifting through listings
            with no photos, no descriptions, and no one to answer for them afterwards.
          </p>
          <p>
            So Munasib is built the other way round. We buy in small batches, check items before
            they are listed, photograph what actually arrives, and write descriptions we would be
            comfortable reading back to a customer. Nothing goes on the shelf on the strength of a
            supplier catalogue alone.
          </p>
          <p>
            We operate from {business.city}, {business.region}, and ship to every province in{' '}
            {business.countryName}. Payment is cash on delivery by default — you pay when the box is
            in your hands, not before.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">What we sell</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            The name says kitchen, and kitchen is our largest shelf — but Munasib is a
            general-purpose everyday-essentials store, and always has been. The catalog spans:
          </p>
          <ul className="flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Kitchen &amp; dining.</span> Prep tools,
              airtight storage, utensils, jugs and serveware.
            </li>
            <li>
              <span className="font-medium text-foreground">Home, living &amp; cleaning.</span>{' '}
              Racks, shelves, brushes, trolleys and the utility items a house gets through.
            </li>
            <li>
              <span className="font-medium text-foreground">Wardrobe &amp; organization.</span>{' '}
              Space-multiplying hangers, drawer dividers, jewellery and travel storage.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Beauty, baby, gadgets &amp; decor.
              </span>{' '}
              Grooming and organizer tools, baby feeding and safety gear, multi-tools, wall decor
              and lighting, plus mobile accessories.
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">How we choose what to stock</h2>
          <ul className="flex flex-col gap-3 text-pretty leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">It has to solve a real problem.</span>{' '}
              If a product does not remove a recurring annoyance, it does not earn its space.
            </li>
            <li>
              <span className="font-medium text-foreground">It has to survive daily use.</span> We
              favour weight, sealing and finish over feature counts — a lid that clicks beats a lid
              that rests.
            </li>
            <li>
              <span className="font-medium text-foreground">The price has to make sense.</span>{' '}
              Useful should not mean expensive. We keep margins tight and say what something costs
              up front, including delivery.
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Buying from us</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Orders reach anywhere in {business.countryName} in {policy.deliveryDaysMin}–
            {policy.deliveryDaysMax} working days. Cash on delivery is available nationwide and card
            payment is supported at checkout. Delivery is free over Rs{' '}
            {policy.freeShippingOver.toLocaleString('en-US')}; below that, the exact courier charge
            for your city is shown before you confirm. If something is not right, you have{' '}
            {policy.returnDays} days from delivery to tell us — see our{' '}
            <Link className="text-foreground underline underline-offset-4" href="/shipping">
              shipping &amp; returns
            </Link>{' '}
            page for the detail, or{' '}
            <Link className="text-foreground underline underline-offset-4" href="/contact">
              contact us
            </Link>{' '}
            directly.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="editorial-heading text-display-sm">Finding the right Munasib</h2>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Munasib trades online only, at{' '}
            <span className="font-medium text-foreground">
              {siteConfig.url.replace(/^https?:\/\//, '')}
            </span>
            . Our official channels are this website, the email and phone number in the footer, and
            the social accounts linked from it. If you are unsure whether an account or listing is
            ours, email{' '}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={`mailto:${siteConfig.contact.email}`}
            >
              {siteConfig.contact.email}
            </a>{' '}
            and we will confirm.
          </p>
        </div>
      </div>
    </Section>
  );
}
