import { Suspense } from 'react';

import { buildMetadata } from '@/lib/seo/metadata';

import { Section } from '@/design-system/primitives/section';

import { SearchClient } from './search-client';

export const metadata = buildMetadata({
  title: 'Search',
  description: 'Search Munasib — kitchen gadgets, storage, cleaning, and household essentials.',
  path: '/search',
  noIndex: true,
});

export default function SearchPage() {
  return (
    <Section>
      <div className="container flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <span className="eyebrow">Search</span>
          <h1 className="editorial-heading text-display-lg">Find what you need</h1>
        </header>
        <Suspense fallback={<div className="h-64" />}>
          <SearchClient />
        </Suspense>
      </div>
    </Section>
  );
}
