import { describe, expect, it } from 'vitest';

import { resolveCapiBrowserParams } from '@/server/analytics/meta-capi';

describe('resolveCapiBrowserParams', () => {
  it('builds fbc from fbclid and keeps fbp cookie', () => {
    const result = resolveCapiBrowserParams({
      host: 'www.example.com',
      cookies: {
        _fbp: 'fb.1.1596403881668.1116446470',
      },
      query: { fbclid: 'AbCdEfGhIjKlMnOpQrStUvWxYz1234567890' },
      xForwardedFor: '203.0.113.10',
    });

    expect(result.fbp).toBeTruthy();
    expect(result.fbp).toContain('fb.1.');
    expect(result.fbc).toBeTruthy();
    expect(result.fbc).toContain('AbCdEfGhIjKlMnOpQrStUvWxYz1234567890');
    // ParamBuilder appends its library token to public IPs.
    expect(result.clientIp).toMatch(/^203\.0\.113\.10\./);
    expect(result.cookiesToSet.some((c) => c.name === '_fbc')).toBe(true);
  });

  it('prefers public IPv6 from the client _fbi cookie', () => {
    const result = resolveCapiBrowserParams({
      host: 'www.example.com',
      cookies: {
        _fbp: 'fb.1.1596403881668.1116446470',
        _fbi: '2001:db8::1',
      },
      xForwardedFor: '203.0.113.10',
    });

    expect(result.clientIp?.toLowerCase().startsWith('2001:db8::1.')).toBe(true);
  });

  it('reads cookies from a Next-like cookie store', () => {
    const store = {
      get(name: string) {
        if (name === '_fbp') return { value: 'fb.1.1596403881668.1116446470' };
        return undefined;
      },
    };
    const result = resolveCapiBrowserParams({
      host: 'localhost',
      cookies: store,
      xForwardedFor: '198.51.100.2',
    });
    expect(result.fbp).toContain('fb.1.');
  });
});
