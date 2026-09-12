import { type NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { z } from 'zod';

import { ADMIN_PREFIXES, AUTH_ROUTES } from '@/config/routes';

const ACCESS_COOKIE = 'elv_at';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'STAFF']);

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.string().min(1),
  email: z.string().min(1),
});

function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

async function verify(token: string) {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'munasib',
      audience: 'munasib:access',
    });
    const parsed = claimsSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Edge middleware — only runs on account/admin/auth routes (see `config.matcher`).
 * Public storefront PDPs skip middleware entirely to cut Edge invocations.
 *
 * Verifies the access-token cookie with jose. JWT is the only auth/role source.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Customer accounts and self-registration are disabled — guest-only shop.
  // 308 so Google drops the old URLs permanently.
  if (pathname === '/account' || pathname.startsWith('/account/') || pathname === '/register') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url, 308);
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verify(token) : null;
  const isAuthed = !!claims;
  const role = claims?.role ?? null;

  const isAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname === p);

  if (isAuthed && isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = role && ADMIN_ROLES.has(role) ? '/admin' : '/';
    return NextResponse.redirect(url);
  }

  if (isAdmin) {
    if (!isAuthed) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
    if (!role || !ADMIN_ROLES.has(role)) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

/**
 * Public catalog/home/blog never hit this middleware. Auth + admin + the
 * permanent /account|/register redirects are the only matched paths.
 */
export const config = {
  matcher: [
    '/account',
    '/account/:path*',
    '/register',
    '/admin',
    '/admin/:path*',
    '/login',
    '/forgot-password',
  ],
};
