import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PluginHostStatus } from '../types';

const execFileAsync = promisify(execFile);
const TTL_MS = 30_000;
const INSTALL_HINT = 'Install: npm i -g @aikidosec/safe-chain — https://github.com/AikidoSec/safe-chain';

let cached: { at: number; result: PluginHostStatus } | undefined;

export interface SafeChainProbe {
  (): Promise<{ found: boolean; version?: string; reason?: string }>;
}

/** Default probe: shells `safe-chain --version`. */
export const defaultProbe: SafeChainProbe = async () => {
  try {
    const { stdout } = await execFileAsync('safe-chain', ['--version'], { timeout: 3000 });
    const version = stdout.trim().split(/\s+/).pop();
    return { found: true, version };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { found: false, reason };
  }
};

export async function isSafeChainAvailable(probe: SafeChainProbe = defaultProbe): Promise<PluginHostStatus> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.result;

  const out = await probe();
  const result: PluginHostStatus = out.found
    ? { available: true, version: out.version }
    : { available: false, reason: out.reason ?? 'safe-chain binary not found', installHint: INSTALL_HINT };
  cached = { at: now, result };
  return result;
}

/** test-only — clears the module-level cache between tests */
export function _resetCacheForTest(): void {
  cached = undefined;
}
