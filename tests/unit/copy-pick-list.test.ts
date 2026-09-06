import { describe, expect, it } from 'vitest';

import {
  formatPickListPlain,
  imageFormula,
  lineDisplayName,
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

describe('pick list formatting', () => {
  it('copies three columns with readable fixed-size IMAGE formulas', () => {
    const text = formatPickListPlain(lines);
    expect(text.split('\n')[0]).toBe('Image\tName\tQty');
    expect(text).toContain(
      '=IMAGE("https://cdn.shopify.com/s/files/1/example/sipper.jpg?width=240",4,120,120)',
    );
    expect(text).toContain('Glass Sipper (450ml) [KIT-1]\t3');
    expect(text).toContain('\tSpice Rack (Default)\t1');
  });

  it('uses IMAGE mode 4 at 120px so thumbs stay readable', () => {
    expect(imageFormula('https://cdn.shopify.com/a.jpg')).toBe(
      '=IMAGE("https://cdn.shopify.com/a.jpg?width=240",4,120,120)',
    );
  });

  it('builds display names with variant details', () => {
    expect(lineDisplayName(lines[0]!)).toBe('Glass Sipper (450ml) [KIT-1]');
  });

  it('builds shopify width thumbs and weserv for other hosts', () => {
    expect(thumbProxyUrl('https://cdn.shopify.com/a.jpg')).toContain('width=240');
    expect(thumbProxyUrl('https://res.cloudinary.com/demo/image/upload/x.jpg')).toContain(
      'images.weserv.nl',
    );
  });
});
