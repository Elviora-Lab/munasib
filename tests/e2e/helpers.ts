import { execFileSync } from 'node:child_process';

/**
 * Direct SQL against the local dev database — used by E2E specs to seed and
 * clean up fixtures (test admin, imported products). Override with
 * E2E_DATABASE_URL when the dev DB lives elsewhere.
 */
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://hshahir@localhost:5432/munasib';

export function sql(query: string): string {
  return execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query], {
    encoding: 'utf-8',
  }).trim();
}
