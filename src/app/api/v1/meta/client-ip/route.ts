import { createHandler } from '@/server/http/handler';
import { isSameSiteRequest } from '@/server/http/origin';
import { isRateLimited } from '@/server/http/rate-limit';
import { apiNoContent, apiSuccess } from '@/server/http/response';

export const runtime = 'nodejs';

/**
 * First-party client IP for Meta's client Parameter Builder `getIpFn`.
 *
 * Prefer a public IPv6 address from the proxy chain, then IPv4. The client SDK
 * stores this in `_fbi`; the server ParamBuilder later picks the best of cookie
 * + request headers when building Conversions API `client_ip_address`.
 *
 * Same-site + rate-limited; empty body when we can't determine a usable IP.
 */
export const GET = createHandler(async (req) => {
  if (!isSameSiteRequest(req)) return apiNoContent();
  if (
    await isRateLimited({
      key: `meta-client-ip:${req.headers.get('x-real-ip') ?? 'x'}`,
      limit: 60,
      windowSeconds: 60,
    })
  ) {
    return apiNoContent();
  }

  const ip = pickPublicClientIp(req);
  if (!ip) return apiNoContent();
  return apiSuccess({ ip });
});

function pickPublicClientIp(req: Request): string | null {
  const candidates: string[] = [];
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    for (const hop of xff.split(',')) {
      const part = hop.trim();
      if (part) candidates.push(part);
    }
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) candidates.push(real);

  const ipv6 = candidates.find((c) => looksLikeIPv6(c) && !isPrivateOrLocal(c));
  if (ipv6) return ipv6;
  const ipv4 = candidates.find((c) => looksLikeIPv4(c) && !isPrivateOrLocal(c));
  return ipv4 ?? null;
}

function looksLikeIPv6(value: string): boolean {
  return value.includes(':');
}

function looksLikeIPv4(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function isPrivateOrLocal(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '127.0.0.1' || lower === '0.0.0.0') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  return false;
}
