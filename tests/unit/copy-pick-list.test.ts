import { describe, expect, it } from 'vitest';

import {
  formatPickListHtml,
  formatPickListPlain,
} from '@/app/admin/orders/pending-items/copy-pick-list';

const lines = [
  {
    productName: 'Glass Sipper',
    variantName: null,
    sku: 'KIT-1',
    size: '450ml',
    shade: null,
    fragrance: null,
    totalQuantity: 3,
    imageUrl: 'https://cdn.shopify.com/example.jpg',
  },
  {
    productName: 'Spice Rack',
    variantName: 'Default',
    sku: null,
    size: null,
    shade: null,
    fragrance: null,
    totalQuantity: 1,
    imageUrl: null,
  },
];

describe('pick list copy formatting', () => {
  it('puts name and qty in separate plain-text columns', () => {
    const text = formatPickListPlain(lines, { statusLabel: 'pending', orderCount: 2 });
    expect(text).toContain('Name\tQty');
    expect(text).toContain('Glass Sipper (450ml) [KIT-1]\t3');
    expect(text).toContain('Spice Rack (Default)\t1');
  });

  it('builds an HTML table with image, name, and qty columns', () => {
    const html = formatPickListHtml(lines, { statusLabel: 'pending', orderCount: 2 }, [
      'data:image/jpeg;base64,abc',
      null,
    ]);
    expect(html).toContain('<th');
    expect(html).toContain('Image');
    expect(html).toContain('Name');
    expect(html).toContain('Qty');
    expect(html).toContain('data:image/jpeg;base64,abc');
    expect(html).toContain('Glass Sipper (450ml) [KIT-1]');
    expect(html).toContain('>3<');
  });
});
