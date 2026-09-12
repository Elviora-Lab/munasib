import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = buildMetadata({
  title: 'Account',
  path: '/account',
  noIndex: true,
});

const tiles = [
  { href: '/account/orders', title: 'Orders', desc: 'Track shipments and reorder favourites.' },
  { href: '/account/wishlist', title: 'Wishlist', desc: 'The pieces you have saved for later.' },
  { href: '/account/addresses', title: 'Addresses', desc: 'Shipping + billing destinations.' },
];

export default function AccountOverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Welcome back</span>
        <h1 className="editorial-heading text-display-md">Your Munasib</h1>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-card">
              <CardHeader>
                <CardTitle>{t.title}</CardTitle>
                <CardDescription>{t.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground group-hover:text-foreground">
                  View →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
