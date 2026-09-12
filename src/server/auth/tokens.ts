import 'server-only';

import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

import { serverEnv } from '@/config/env';

const ACCESS_TTL_SECONDS = 60 * 15; // 15 minutes
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const RESET_TTL_SECONDS = 60 * 30; // 30 minutes

const ISSUER = 'munasib';
const ACCESS_AUDIENCE = 'munasib:access';
const REFRESH_AUDIENCE = 'munasib:refresh';
const RESET_AUDIENCE = 'munasib:pwreset';

// Validated (not just cast) after signature verification — a token signed with
// the right key but carrying a malformed payload is rejected, never trusted.
const accessClaimsSchema = z.object({
  /** user id */
  sub: z.string().min(1),
  // Mirrors Prisma's UserRole enum exactly — do not add roles here that the
  // database cannot store.
  role: z.enum(['CUSTOMER', 'VIP', 'STAFF', 'ADMIN', 'SUPER_ADMIN']),
  email: z.string().min(1),
});

const refreshClaimsSchema = z.object({
  sub: z.string().min(1),
  /** refresh-token id (for rotation/revocation) */
  jti: z.string().min(1),
});

export type AccessClaims = z.infer<typeof accessClaimsSchema>;
export type RefreshClaims = z.infer<typeof refreshClaimsSchema>;

function secret(kind: 'access' | 'refresh') {
  const raw =
    kind === 'access'
      ? serverEnv.JWT_SECRET
      : (serverEnv.JWT_REFRESH_SECRET ?? serverEnv.JWT_SECRET);
  if (!raw) throw new Error(`Missing ${kind === 'access' ? 'JWT_SECRET' : 'JWT_REFRESH_SECRET'}`);
  return new TextEncoder().encode(raw);
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setSubject(claims.sub)
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret('access'));
}

export async function signRefreshToken(claims: RefreshClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(REFRESH_AUDIENCE)
    .setSubject(claims.sub)
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(secret('refresh'));
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret('access'), {
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
  });
  return accessClaimsSchema.parse(payload);
}

export async function verifyRefreshToken(token: string): Promise<RefreshClaims> {
  const { payload } = await jwtVerify(token, secret('refresh'), {
    issuer: ISSUER,
    audience: REFRESH_AUDIENCE,
  });
  return refreshClaimsSchema.parse(payload);
}

/**
 * Stateless password-reset token: a short-lived JWT bound to the user id with
 * a dedicated audience so it can't be used as an access/refresh token.
 */
export async function signPasswordResetToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(RESET_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(`${RESET_TTL_SECONDS}s`)
    .sign(secret('access'));
}

export async function verifyPasswordResetToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, secret('access'), {
    issuer: ISSUER,
    audience: RESET_AUDIENCE,
  });
  return { sub: String(payload.sub) };
}

const REVIEW_AUDIENCE = 'munasib:review';
const REVIEW_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

/**
 * Signed "leave a review" token, bound to an order id. Emailed after delivery so
 * a guest (no account) can post a verified-purchase review — the token IS the
 * proof of purchase. Dedicated audience so it can't act as an access token.
 */
export async function signReviewToken(orderId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(REVIEW_AUDIENCE)
    .setSubject(orderId)
    .setExpirationTime(`${REVIEW_TTL_SECONDS}s`)
    .sign(secret('access'));
}

export async function verifyReviewToken(token: string): Promise<{ orderId: string }> {
  const { payload } = await jwtVerify(token, secret('access'), {
    issuer: ISSUER,
    audience: REVIEW_AUDIENCE,
  });
  return { orderId: String(payload.sub) };
}

export const tokenTtl = {
  access: ACCESS_TTL_SECONDS,
  refresh: REFRESH_TTL_SECONDS,
  reset: RESET_TTL_SECONDS,
};
