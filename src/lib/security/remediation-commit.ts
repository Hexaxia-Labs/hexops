import type { FindingRow, FixSeverity } from './cve-lite-view';
import { FIX_SEVERITY_ORDER } from './cve-lite-view';
import type { UpdatedPackage } from '@/lib/patch-commit-message';

export interface RemediationCommit {
  /** Feeds generatePatchCommitMessage. */
  packages: UpdatedPackage[];
  /** De-duped advisory IDs (GHSA + CVE) for the audit trail. */
  advisories: string[];
  /** Highest severity among the included rows. */
  severity?: FixSeverity;
}

function maxSeverity(severities: FixSeverity[]): FixSeverity | undefined {
  let best: FixSeverity | undefined;
  for (const s of severities) {
    if (best === undefined || FIX_SEVERITY_ORDER.indexOf(s) < FIX_SEVERITY_ORDER.indexOf(best)) {
      best = s;
    }
  }
  return best;
}

function pkgFromRow(row: FindingRow): UpdatedPackage {
  return {
    name: row.package,
    fromVersion: row.version ?? '',
    toVersion: row.validatedFixVersion ?? '',
    isSecurityFix: true,
    vulnCount: row.advisoryIds.length,
  };
}

/** Build a remediation commit from a single applied finding row (applyOne). */
export function remediationFromRow(row: FindingRow): RemediationCommit {
  return {
    packages: [pkgFromRow(row)],
    advisories: [...new Set(row.advisoryIds)],
    severity: row.severity,
  };
}

/**
 * Build a remediation commit from all displayed rows, filtered to what
 * `cve-lite --fix` (mode `all`) addresses: direct deps with a validated fix.
 */
export function remediationFromRows(rows: FindingRow[]): RemediationCommit {
  const fixable = rows.filter((r) => r.relationship === 'direct' && r.validatedFixVersion);
  return {
    packages: fixable.map(pkgFromRow),
    advisories: [...new Set(fixable.flatMap((r) => r.advisoryIds))],
    severity: maxSeverity(fixable.map((r) => r.severity)),
  };
}
