import type { Finding } from './types';

/**
 * Heuristically derive the "parent npm package" responsible for a finding.
 * grype's path field looks like '/node_modules/<pkg>/...' or
 * '/node_modules/@scope/<pkg>/...'. The npm-readable parent is whatever
 * package owns the directory the vulnerable artifact sits in.
 *
 * Returns undefined when no parent can be derived (e.g. lockfile-only
 * findings where path is empty, or system-level scans).
 */
const NODE_MODULES_PARENT = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/;

export function deriveParentPackage(finding: Finding): string | undefined {
  if (!finding.path) return undefined;
  const match = finding.path.match(NODE_MODULES_PARENT);
  if (match) return match[1];
  // No node_modules in the path — finding isn't inside a dependency
  return undefined;
}
