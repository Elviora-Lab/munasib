import { describe, expect, it } from 'vitest';

import {
  formatPickListHtml,
  formatPickListPlain,
  thumbProxyUrl,
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
    imageUrl: 'https://cdn.shopify.com/s/files/1/example/sipper.jpg',
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
  it('builds spreadsheet columns with IMAGE formulas for thumbnails', () => {
    const text = formatPickListPlain(lines);
    expect(text.split('\n')[0]).toBe('Image\tName\tQty');
    expect(text).toContain(
      '=IMAGE("https://cdn.shopify.com/s/files/1/example/sipper.jpg?width=120")',
    );
    expect(text).toContain('Glass Sipper (450ml) [KIT-1]\t3');
    expect(text).toContain('\tSpice Rack (Default)\t1');
  });

  it('uses https thumbnail URLs in HTML (not data-URLs)', () => {
    const html = formatPickListHtml(lines, { statusLabel: 'pending', orderCount: 2 });
    expect(html).toContain('Image');
    expect(html).toContain('Name');
    expect(html).toContain('Qty');
    expect(html).toContain('cdn.shopify.com');
    expect(html).not.toContain('data:image');
    expect(html).toContain('Glass Sipper (450ml) [KIT-1]');
  });

  it('builds shopify width thumbs and weserv for other hosts', () => {
    expect(thumbProxyUrl('https://cdn.shopify.com/a.jpg')).toContain('width=120');
    expect(thumbProxyUrl('https://res.cloudinary.com/demo/image/upload/x.jpg')).toContain(
      'images.weserv.nl',
    );
  });
});
