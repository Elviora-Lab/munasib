import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';

import { BulkImport } from './bulk-import';

export const metadata = buildMetadata({ title: 'Admin · Import products', noIndex: true });

export default function ImportProductsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/admin/products"
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          ← Products
        </Link>
        <h1 className="editorial-heading text-display-md">Bulk import</h1>
        <p className="text-sm text-muted-foreground">
          Upload or paste a CSV — either the simple template, or a{' '}
          <strong>Shopify product export</strong> (Products → Export). Shopify variants, option
          values, compare-at prices, inventory, and image galleries are all imported. Products match
          by handle, variants by SKU, so re-importing a newer export safely updates the catalog.
        </p>
      </header>

      <BulkImport />

      <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Simple CSV example</p>
        <pre className="overflow-x-auto">{`name,price,sku,category,brand,description,imageUrl,stock,isActive
Adjustable Spice Rack,1499,KIT-SR-01,Storage,Munasib,Two-tier expandable rack,https://cdn.example.com/rack.jpg,100,true
Microfibre Mop Set,999,KIT-MP-02,Cleaning,Munasib,Flat mop with washable pads,,50,true`}</pre>
      </div>
    </div>
  );
}
