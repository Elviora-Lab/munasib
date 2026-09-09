import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';

import { buildMetadata } from '@/lib/seo/metadata';

import { ProductDetail } from '../_components/product-detail';

import { requireAdmin } from '@/server/auth/guards';
import { getProductPageDataFresh } from '@/server/products/product-page-data';

type Params = Promise<{ slug: string }>;

// Admin-only preview — always dynamic; never share the public PDP cache.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'Product preview', noIndex: true });

export default async function ProductPreviewPage({ params }: { params: Params }) {
  const { slug } = await params;

  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  const data = await getProductPageDataFresh(slug, { allowInactive: true });
  if (!data) notFound();

  return (
    <>
      <div className="border-b border-brand-amber/30 bg-brand-stone/40 text-brand-slate">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="flex items-center gap-2 text-sm">
            <Eye className="size-4" />
            <span className="font-medium">Admin preview</span>
            <span className="text-brand-slate/70">
              {data.product.isActive
                ? 'This product is live on the storefront.'
                : 'This product is hidden — not visible to the public.'}
            </span>
          </p>
          <Link
            href={`/admin/products/${data.product.id}`}
            className="text-xs uppercase tracking-[0.12em] underline underline-offset-4"
          >
            Edit in admin →
          </Link>
        </div>
      </div>

      <ProductDetail slug={slug} data={data} trackView={false} />
    </>
  );
}
