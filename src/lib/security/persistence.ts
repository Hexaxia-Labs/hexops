import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { ScanResult } from './types';

const DEFAULT_CACHE_DIR = join(process.cwd(), '.hexops', 'cache');
let cacheDir = DEFAULT_CACHE_DIR;

export function _setCacheDirForTest(dir: string) {
  cacheDir = dir;
}

function ensureDir() {
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
}

function cachePath(projectId: string) {
  return join(cacheDir, `security-${projectId}.json`);
}

export function readSecurityCache(projectId: string): ScanResult | null {
  const path = cachePath(projectId);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ScanResult;
    if (parsed.cacheVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSecurityCache(projectId: string, result: ScanResult): void {
  ensureDir();
  const finalPath = cachePath(projectId);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(result, null, 2));
  try {
    renameSync(tmpPath, finalPath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}
