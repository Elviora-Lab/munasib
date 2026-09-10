import { PrismaClient } from '@prisma/client';

import { isDev } from '@/config/env';

/**
 * Prisma client singleton.
 *
 * Next.js dev mode hot-reloads modules — without this guard, each reload
 * creates a new PrismaClient and exhausts the Postgres connection pool.
 * In production the cache is a no-op (module is loaded once).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * During `next build`, hundreds of PDPs are prerendered. Give the pool a
 * longer wait so transient contention doesn't fail the export. Runtime stays
 * on the URL as configured (typically a small serverless pool).
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.NEXT_PHASE !== 'phase-production-build') return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '60');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'error', 'warn'] : ['error'],
    datasources: { db: { url: datasourceUrl() } },
  });

if (isDev) {
  globalForPrisma.prisma = prisma;
}
