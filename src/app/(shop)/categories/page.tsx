import Image from 'next/image';
import Link from 'next/link';

import { categorySeo } from '@/config/category-seo';
import { routes } from '@/config/routes';
import { siteConfig } from '@/config/site';

import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/json-ld-component';
import { absoluteUrl, buildMetadata } from '@/lib/seo/metadata';

import { Breadcrumb } from '@/design-system/primitives/breadcrumb';
import { Section, SectionHeading } from '@/design-system/primitives/section';

import { categoriesService } from '@/server/services/categories.service';
import { productsService } from '@/server/services/products.service';

export const metadata = buildMetadata({
  title: 'Shop by Category — Home, Kitchen & Everyday Essentials',
  description:
    'Browse every Munasib category — kitchen accessories, home and living, wardrobe organizers, beauty, gadgets, decor, baby and mobile accessories.',
  path: '/categories',
});

export const revalidate = 3600;

export default async function CategoriesIndexPage() {
  // This page previously filtered to `children.length > 0`. The catalog moved
  // to a flat, one-level taxonomy, so no category has children — and the hub
  // rendered ZERO cards while still sitting in the sitemap and being the
  // destination of the homepage's "Browse categories" CTA. Every top-level
  // category is merchandisable; only the "uncategorized" holding pen (a
  // deliberate non-destination) is excluded.
  const tree = await categoriesService.tree().catch(() => []);
  const merchandising = tree.filter((c) => c.slug !== 'uncategorized');

  // Counts come from the same service the listings use, so the number on a
  // card always matches what the category page will actually show.
  const counts = await Promise.all(
    merchandising.map((c) =>
      productsService
        .list({ category: c.slug }, 'newly-added', 1, 1)
        .then((r) => r.total)
        .catch(() => 0),
    ),
  );

  const cards = merchandising.map((c, i) => {
    const seo = categorySeo(c.slug);
    return {
      name: seo?.h1 ?? c.name,
      href: routes.category(c.slug),
      // The one-line hook, not the full lead paragraph — a card is a signpost.
      blurb: c.description ?? seo?.blurb ?? null,
      image: c.image,
      count: counts[i] ?? 0,
    };
  });

  return (
    <Section>
      <div className="container flex flex-col gap-10">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Categories' }]} />
        <SectionHeading
          as="h1"
          eyebrow="Everything we sell"
          title="Shop by category"
          description="Munasib spans the whole house — cooking and storage, cleaning and utility, wardrobe and decor, beauty, baby and everyday gadgets. Pick a shelf to start on."
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-md p-6 transition-shadow hover:shadow-card"
            >
              {cat.image ? (
                <>
                  <Image
                    src={cat.image}
                    alt={`${cat.name} — shop the category at ${siteConfig.name}`}
                    fill
                    sizes="(min-width:1024px) 25vw, (min-width:768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-swift group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-ink/75 via-brand-ink/15 to-transparent" />
                </>
              ) : (
                <>
                  <div className="surface-cloud absolute inset-0" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                </>
              )}
              <div
                className={`relative flex flex-col gap-1 ${cat.image ? 'text-brand-cloud' : ''}`}
              >
                <span className={`eyebrow ${cat.image ? 'text-brand-cloud/80' : ''}`}>
                  {cat.count > 0 ? `${cat.count} products` : 'Discover'}
                </span>
                <h2 className="font-serif text-2xl font-light">{cat.name}</h2>
                {cat.blurb ? (
                  <p
                    className={`line-clamp-3 text-xs leading-relaxed ${
                      cat.image ? 'text-brand-cloud/80' : 'text-muted-foreground'
                    }`}
                  >
                    {cat.blurb}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <JsonLd
        data={breadcrumbJsonLd([
          { label: 'Home', href: '/' },
          { label: 'Categories', href: '/categories' },
        ])}
      />
      {/* The hub's ItemList points at categories, not products, so it is built
          by hand rather than through `collectionPageJsonLd`'s product shape. */}
      <JsonLd
        data={{
          ...collectionPageJsonLd({
            name: 'Shop by category',
            description: siteConfig.description,
            path: '/categories',
            items: [],
          }),
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: cards.length,
            itemListElement: cards.map((cat, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: cat.name,
              url: absoluteUrl(cat.href),
            })),
          },
        }}
      />
    </Section>
  );
}
