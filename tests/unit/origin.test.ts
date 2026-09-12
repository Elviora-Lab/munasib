import { describe, expect, it } from 'vitest';

import { isSameSiteRequest } from '@/server/http/origin';

// Build a Request carrying the given headers. The same-site check compares the
// Origin/Referer host against the host the request was actually served on
// (x-forwarded-host, falling back to host) — NOT a statically configured URL.
function reqWith(headers: Record<string, string>): Request {
  return new Request('https://ignored.example/api/v1/auth/login', {
    method: 'POST',
    headers,
  });
}

describe('isSameSiteRequest', () => {
  it('accepts an Origin matching the forwarded host (Vercel alias)', () => {
    expect(
      isSameSiteRequest(
        reqWith({
          'x-forwarded-host': 'munasib-seven.vercel.app',
          origin: 'https://munasib-seven.vercel.app',
        }),
      ),
    ).toBe(true);
  });

  it('accepts an Origin matching a custom/preview host (no static config)', () => {
    expect(
      isSameSiteRequest(
        reqWith({
          'x-forwarded-host': 'shop.elviora.com',
          origin: 'https://shop.elviora.com',
        }),
      ),
    ).toBe(true);
  });

  it('falls back to the host header when x-forwarded-host is absent', () => {
    expect(
      isSameSiteRequest(reqWith({ host: 'localhost:3000', origin: 'http://localhost:3000' })),
    ).toBe(true);
  });

  it('takes the first entry of a forwarded proxy chain', () => {
    expect(
      isSameSiteRequest(
        reqWith({
          'x-forwarded-host': 'munasib-seven.vercel.app, internal-proxy',
          origin: 'https://munasib-seven.vercel.app',
        }),
      ),
    ).toBe(true);
  });

  it('rejects a cross-site Origin', () => {
    expect(
      isSameSiteRequest(
        reqWith({
          'x-forwarded-host': 'munasib-seven.vercel.app',
          origin: 'https://attacker.example',
        }),
      ),
    ).toBe(false);
  });

  it('uses Referer when Origin is absent', () => {
    expect(
      isSameSiteRequest(
        reqWith({
          'x-forwarded-host': 'munasib-seven.vercel.app',
          referer: 'https://munasib-seven.vercel.app/login',
        }),
      ),
    ).toBe(true);
    expect(
      isSameSiteRequest(
        reqWith({
          'x-forwarded-host': 'munasib-seven.vercel.app',
          referer: 'https://attacker.example/login',
        }),
      ),
    ).toBe(false);
  });

  it('treats a request with neither Origin nor Referer as not same-site', () => {
    expect(isSameSiteRequest(reqWith({ 'x-forwarded-host': 'munasib-seven.vercel.app' }))).toBe(
      false,
    );
  });

  it('rejects when the served host cannot be determined', () => {
    expect(isSameSiteRequest(reqWith({ origin: 'https://munasib-seven.vercel.app' }))).toBe(false);
  });
});
