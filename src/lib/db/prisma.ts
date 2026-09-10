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
 * During `next build`, Next spawns multiple SSG workers and each gets its own
 * PrismaClient. Default pool size is ~num_cpus*2+1 — enough workers × that
 * pool exhausts Supabase's max clients (EMAXCONN / 200). Cap each worker to
 * one connection and wait longer under contention. Runtime keeps DATABASE_URL
 * as configured (serverless-friendly pooler settings).
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.NEXT_PHASE !== 'phase-production-build') return raw;
  try {
    const url = new URL(raw);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '60');
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

// Always pin the singleton — build workers and serverless alike benefit.
globalForPrisma.prisma = prisma;
