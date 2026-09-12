'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { bulkImportProducts, importShopifyProducts } from '@/server/actions/admin/products.actions';

const TEMPLATE_CSV = `name,price,sku,category,brand,description,imageUrl,stock,isActive
Adjustable Spice Rack,1499,KIT-SR-01,Storage,Munasib,Two-tier expandable rack for cupboards,https://cdn.example.com/spice-rack.jpg,100,true
Microfibre Mop Set,999,KIT-MP-02,Cleaning,Munasib,Flat mop with two washable pads,,50,true
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'munasib-products-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type ImportRow = {
  name: string;
  price: string;
  sku?: string;
  category?: string;
  brand?: string;
  shortDescription?: string;
  imageUrl?: string;
  stock?: string;
  isActive?: boolean;
};

// Minimal CSV parser: handles quoted fields, escaped quotes, and newlines.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? '').trim()])));
}

const pick = (o: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (o[k]) return o[k];
  return '';
};

function toRows(raw: Record<string, string>[]): { valid: ImportRow[]; skipped: number } {
  let skipped = 0;
  const valid: ImportRow[] = [];
  for (const o of raw) {
    const name = pick(o, 'name', 'product', 'title').slice(0, 255);
    const priceStr = pick(o, 'price', 'current_price');
    const price = Number(priceStr);
    if (name.length < 2 || priceStr === '' || Number.isNaN(price) || price < 0) {
      skipped++;
      continue;
    }
    const img = pick(o, 'imageurl', 'image', 'image_url');
    const activeStr = pick(o, 'isactive', 'active', 'status');
    valid.push({
      name,
      price: priceStr,
      sku: pick(o, 'sku').slice(0, 80) || undefined,
      category: pick(o, 'category', 'categories').slice(0, 120) || undefined,
      brand: pick(o, 'brand', 'vendor').slice(0, 160) || undefined,
      shortDescription:
        pick(o, 'shortdescription', 'short_description', 'description').slice(0, 500) || undefined,
      imageUrl: /^https?:\/\//i.test(img) ? img : undefined,
      stock: /^\d+$/.test(pick(o, 'stock', 'inventory'))
        ? pick(o, 'stock', 'inventory')
        : undefined,
      isActive: activeStr ? !/^(false|0|no|hidden|inactive|disabled)$/i.test(activeStr) : undefined,
    });
  }
  return { valid, skipped };
}

// ---------------------------------------------------------------------------
// Shopify product-export CSV
// ---------------------------------------------------------------------------
// Shopify exports one row per VARIANT (plus image-only rows): only the first
// row of a product carries the Title; follow-up rows repeat the handle with
// their own option values / SKU / price / image. Supports both the current
// admin export ("URL handle", "Option1 name", "Compare-at price") and the
// classic format ("Handle", "Option1 Name", "Variant Price", "Image Src").

export type ShopifyVariantInput = {
  sku?: string;
  price: number;
  compareAt?: number;
  stock?: number;
  size?: string;
  shade?: string;
  fragrance?: string;
  imageUrl?: string;
};

export type ShopifyProductInput = {
  handle: string;
  title: string;
  description?: string;
  vendor?: string;
  category?: string;
  isActive: boolean;
  seoTitle?: string;
  seoDescription?: string;
  images: Array<{ url: string; position: number; alt?: string }>;
  variants: ShopifyVariantInput[];
};

function isShopifyCsv(raw: Record<string, string>[]): boolean {
  if (!raw.length) return false;
  const keys = Object.keys(raw[0] ?? {});
  return keys.includes('title') && (keys.includes('url handle') || keys.includes('handle'));
}

const num = (s: string): number | undefined => {
  const n = Number(s.replace(/,/g, ''));
  return s !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Map a Shopify option (name, value) onto our variant label columns. */
function applyOption(v: ShopifyVariantInput, name: string, value: string) {
  if (!value || /^default title$/i.test(value)) return;
  if (/size|capacity|volume|weight/i.test(name) && !v.size) v.size = value.slice(0, 64);
  else if (/colou?r|shade|finish|pattern/i.test(name) && !v.shade) v.shade = value.slice(0, 64);
  else if (/scent|fragrance|flavou?r/i.test(name) && !v.fragrance) v.fragrance = value.slice(0, 64);
  else v.size = [v.size, value].filter(Boolean).join(' / ').slice(0, 64);
}

function parseShopify(raw: Record<string, string>[]): {
  products: ShopifyProductInput[];
  skipped: number;
} {
  const byHandle = new Map<string, ShopifyProductInput>();
  let skipped = 0;

  for (const o of raw) {
    const handle = pick(o, 'url handle', 'handle');
    if (!handle) {
      skipped++;
      continue;
    }

    let product = byHandle.get(handle);
    const title = pick(o, 'title');
    if (!product) {
      if (!title) {
        // Variant/image row for a product whose Title row wasn't in the file.
        skipped++;
        continue;
      }
      const status = pick(o, 'status').toLowerCase();
      const published = pick(o, 'published on online store', 'published').toLowerCase();
      product = {
        handle,
        title: title.slice(0, 255),
        description: pick(o, 'description', 'body (html)') || undefined,
        vendor: pick(o, 'vendor').slice(0, 160) || undefined,
        // Type is the merchant's own short label; the taxonomy path's last
        // segment is the fallback ("Home & Garden > Kitchen > Tools" → Tools).
        category:
          (pick(o, 'type') || pick(o, 'product category').split('>').pop() || '')
            .trim()
            .slice(0, 120) || undefined,
        isActive: (status === '' || status === 'active') && published !== 'false',
        seoTitle: pick(o, 'seo title').slice(0, 255) || undefined,
        seoDescription: pick(o, 'seo description').slice(0, 500) || undefined,
        images: [],
        variants: [],
      };
      byHandle.set(handle, product);
    }

    // Gallery image on this row?
    const imageUrl = pick(o, 'product image url', 'image src');
    if (/^https?:\/\//i.test(imageUrl)) {
      const position = num(pick(o, 'image position')) ?? product.images.length + 1;
      if (!product.images.some((im) => im.url === imageUrl)) {
        product.images.push({
          url: imageUrl,
          position,
          alt: pick(o, 'image alt text').slice(0, 255) || undefined,
        });
      }
    }

    // Variant on this row? (price is the signal — image-only rows have none)
    const price = num(pick(o, 'price', 'variant price'));
    if (price !== undefined) {
      const variant: ShopifyVariantInput = { price };
      const sku = pick(o, 'sku', 'variant sku').slice(0, 80);
      if (sku) variant.sku = sku;
      const compareAt = num(pick(o, 'compare-at price', 'variant compare at price'));
      if (compareAt !== undefined && compareAt > price) variant.compareAt = compareAt;
      const stock = num(pick(o, 'inventory quantity', 'variant inventory qty'));
      if (stock !== undefined) variant.stock = Math.floor(stock);
      const variantImage = pick(o, 'variant image url', 'variant image');
      if (/^https?:\/\//i.test(variantImage)) variant.imageUrl = variantImage;
      for (const slot of ['option1', 'option2', 'option3'] as const) {
        applyOption(variant, pick(o, `${slot} name`), pick(o, `${slot} value`));
      }
      product.variants.push(variant);
    }
  }

  const products = [...byHandle.values()].filter((p) => {
    if (p.variants.length === 0) {
      skipped++;
      return false;
    }
    return true;
  });
  return { products, skipped };
}

type Parsed =
  | { mode: 'empty' }
  | { mode: 'simple'; valid: ImportRow[]; skipped: number }
  | { mode: 'shopify'; products: ShopifyProductInput[]; skipped: number };

export function BulkImport() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [replaceCatalog, setReplaceCatalog] = useState(false);
  const [pending, start] = useTransition();

  const parsed: Parsed = useMemo(() => {
    if (!text.trim()) return { mode: 'empty' };
    try {
      const raw = parseCsv(text);
      if (isShopifyCsv(raw)) return { mode: 'shopify', ...parseShopify(raw) };
      return { mode: 'simple', ...toRows(raw) };
    } catch {
      return { mode: 'empty' };
    }
  }, [text]);

  const ready =
    parsed.mode === 'shopify'
      ? parsed.products.length
      : parsed.mode === 'simple'
        ? parsed.valid.length
        : 0;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  function runImport() {
    if (ready === 0) return;
    start(async () => {
      if (parsed.mode === 'shopify') {
        const res = await importShopifyProducts({
          products: parsed.products,
          deactivateOthers: replaceCatalog,
        });
        if (res.success) {
          const { created, updated, failed, deactivated, errors } = res.data;
          toast.success(
            `Imported: ${created} created, ${updated} updated` +
              (deactivated ? `, ${deactivated} hidden` : '') +
              (failed ? `, ${failed} failed` : ''),
          );
          for (const err of errors.slice(0, 3)) toast.error(`${err.handle}: ${err.message}`);
          setText('');
          router.push('/admin/products');
          router.refresh();
        } else {
          toast.error(res.message);
        }
        return;
      }
      if (parsed.mode !== 'simple') return;
      const res = await bulkImportProducts({ rows: parsed.valid });
      if (res.success) {
        const { created, updated, failed } = res.data;
        toast.success(
          `Imported: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ''}`,
        );
        setText('');
        router.push('/admin/products');
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  const shopify = parsed.mode === 'shopify' ? parsed : null;
  const variantCount = shopify?.products.reduce((n, p) => n + p.variants.length, 0) ?? 0;
  const imageCount = shopify?.products.reduce((n, p) => n + p.images.length, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          Upload CSV
          {parsed.mode === 'shopify' ? (
            <Badge variant="info">
              <FileSpreadsheet className="mr-1 size-3" /> Shopify export
            </Badge>
          ) : null}
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={downloadTemplate}>
          <Download className="size-4" /> Template
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="…or paste CSV here (simple template or a Shopify product export)"
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {shopify ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={replaceCatalog}
              onChange={(e) => setReplaceCatalog(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-primary"
            />
            <span>
              <span className="font-medium">This file is my full catalog.</span>{' '}
              <span className="text-muted-foreground">
                Hide every store product that isn&apos;t in it (they&apos;re deactivated, not
                deleted — reversible from the products list).
              </span>
            </span>
          </label>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {parsed.mode === 'empty'
              ? 'Simple headers: name, price, sku, category, brand, description, imageUrl, stock, isActive — or drop in a Shopify product export.'
              : shopify
                ? `${shopify.products.length} product${shopify.products.length === 1 ? '' : 's'} · ${variantCount} variant${variantCount === 1 ? '' : 's'} · ${imageCount} image${imageCount === 1 ? '' : 's'}${shopify.skipped ? ` · ${shopify.skipped} rows skipped` : ''}`
                : parsed.mode === 'simple'
                  ? `${parsed.valid.length} ready to import${parsed.skipped ? ` · ${parsed.skipped} skipped (missing name/price)` : ''}`
                  : ''}
          </p>
          <Button onClick={runImport} loading={pending} disabled={ready === 0} uppercase>
            Import {ready || ''}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
