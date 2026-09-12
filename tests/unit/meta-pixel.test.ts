import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadProductionPixel() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://munasib.pk';
  process.env.NEXT_PUBLIC_FB_PIXEL_ID = '1491044679492326';
  return import('@/lib/analytics/meta-pixel');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env.NEXT_PUBLIC_ENVIRONMENT = 'development';
  delete process.env.NEXT_PUBLIC_FB_PIXEL_ID;
});

describe('meta pixel queue', () => {
  it('queues product events until fbq is ready, preserving the dedupe event id', async () => {
    vi.stubGlobal('window', {});
    const { flushQueuedPixelEvents, metaPixel } = await loadProductionPixel();

    metaPixel.viewContent(
      {
        id: 'c4ee3f06-0d63-4f3b-9b2f-ce4ee335e86f',
        name: '5-Ring Hole Hanger With 3-Layer For Multipurpose',
        price: 189,
        currency: 'PKR',
      },
      'event-1',
    );

    const fbq = vi.fn();
    vi.stubGlobal('window', { fbq });
    flushQueuedPixelEvents();

    expect(fbq).toHaveBeenCalledWith(
      'track',
      'ViewContent',
      {
        content_ids: ['c4ee3f06-0d63-4f3b-9b2f-ce4ee335e86f'],
        content_name: '5-Ring Hole Hanger With 3-Layer For Multipurpose',
        content_type: 'product',
        contents: [{ id: 'c4ee3f06-0d63-4f3b-9b2f-ce4ee335e86f', item_price: 189 }],
        value: 189,
        currency: 'PKR',
      },
      { eventID: 'event-1' },
    );
  });
});
