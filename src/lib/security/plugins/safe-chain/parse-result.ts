import type { InstallGateResult } from '../types';

const BLOCK_MARKER = /\[safe-chain\]\s+BLOCKED/i;
const ADVISORY_REF = /\b(MAL-\d{4}-\d+|GHSA-[a-z0-9-]+|CVE-\d{4}-\d+)\b/g;

export function parseSafeChainResult(input: { code: number; stdout: string; stderr: string }): InstallGateResult {
  if (input.code === 0) return { blocked: false };
  if (!BLOCK_MARKER.test(input.stderr)) {
    // Non-zero exit without a Safe Chain block marker = some other install failure.
    // Treat as not blocked so the caller bubbles it up as a regular install error.
    return { blocked: false };
  }

  // Pull a useful tail line for the UI banner: prefer "Refusing to install."
  // line if present, else the final non-empty line.
  const lines = input.stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const refusal = lines.find((l) => /refusing to install/i.test(l));
  const message = refusal ?? lines[lines.length - 1] ?? 'Safe Chain blocked the install';

  const refs = Array.from(input.stderr.matchAll(ADVISORY_REF)).map((m) => m[1]);
  const advisoryRefs = Array.from(new Set(refs));

  return { blocked: true, message, advisoryRefs };
}
