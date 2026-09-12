import Image from 'next/image';
import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate } from '@/utils/format';

import { EmptyState } from '@/design-system/primitives/empty-state';
import { Section, SectionHeading } from '@/design-system/primitives/section';

import { blogRepo } from '@/server/repositories/blog.repo';

export const metadata = buildMetadata({
  title: 'Home Guides — Organization & Kitchen Tips for Pakistani Homes',
  description:
    'Practical home guides from Munasib — closet and kitchen organization ideas, storage tips, and product know-how, with links to the products that solve each problem.',
  path: '/blog',
});

export const revalidate = 300;

function excerpt(post: { seoDescription: string | null; content: string }) {
  return post.seoDescription?.trim() || `${post.content.trim().slice(0, 160)}…`;
}

export default async function BlogIndexPage() {
  // Resilient: don't fail the build if the DB is unavailable at prerender time.
  const posts = await blogRepo.listPublished().catch(() => []);

  return (
    <Section>
      <div className="container flex flex-col gap-10">
        <SectionHeading
          as="h1"
          eyebrow="Home Guides"
          title="Make your space work harder."
          description="Practical organization ideas, kitchen tips, and product know-how from the Munasib team."
        />

        {posts.length === 0 ? (
          <EmptyState
            title="Guides are on the way"
            description="We're putting the finishing touches on our first home and kitchen guides. Check back soon."
          />
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group flex flex-col gap-3">
                <div className="relative aspect-[3/2] overflow-hidden rounded-md bg-gradient-cloud">
                  {post.thumbnail ? (
                    <Image
                      src={post.thumbnail}
                      alt={post.title}
                      fill
                      sizes="(min-width:1024px) 33vw, (min-width:768px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-swift group-hover:scale-[1.04]"
                    />
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  {post.publishedAt ? (
                    <span className="eyebrow">
                      {formatDate(post.publishedAt, { dateStyle: 'medium' })}
                    </span>
                  ) : null}
                  <h2 className="font-serif text-xl font-light group-hover:underline">
                    {post.title}
                  </h2>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                    {excerpt(post)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
