import 'server-only';

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Dev/local disk cache for print assets (AWB PDFs + image thumbs).
 * Skips PostEx/CDN on repeat prints — the main remaining local latency.
 *
 * Enabled when not production, or when PRINT_DISK_CACHE=1.
 */
export function printDiskCacheEnabled(): boolean {
  if (process.env.PRINT_DISK_CACHE === '0') return false;
  if (process.env.PRINT_DISK_CACHE === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

const ROOT = path.join(process.cwd(), 'tmp', 'print-cache');

function safeKey(raw: string): string {
  return createHash('sha1').update(raw).digest('hex');
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function readPrintCache(
  kind: 'awb' | 'img' | 'pack',
  key: string,
): Promise<Uint8Array | null> {
  if (!printDiskCacheEnabled()) return null;
  try {
    const file = path.join(ROOT, kind, `${safeKey(key)}.bin`);
    return await readFile(file);
  } catch {
    return null;
  }
}

export async function writePrintCache(
  kind: 'awb' | 'img' | 'pack',
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  if (!printDiskCacheEnabled()) return;
  try {
    const dir = path.join(ROOT, kind);
    await ensureDir(dir);
    await writeFile(path.join(dir, `${safeKey(key)}.bin`), bytes);
  } catch {
    // Cache is best-effort — never fail a print on disk errors.
  }
}
