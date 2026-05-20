import { SEVERITY_RANK } from './types';
import type { Finding, Severity } from './types';

export function computeDedupKey(f: Finding): string {
  switch (f.type) {
    case 'vulnerability': {
      const ghsa = f.advisoryIds.find((id) => id.startsWith('GHSA-'));
      if (ghsa) return `vuln:${ghsa}`;
      const cve = f.advisoryIds.find((id) => id.startsWith('CVE-'));
      if (cve) return `vuln:${cve}`;
      return `vuln:${f.package ?? '?'}@${f.version ?? '?'}|${f.title}`;
    }
    case 'integrity':
      return `integ:${f.package ?? '?'}@${f.version ?? '?'}|${f.title}`;
    case 'secret': {
      const fp = (f.detail.match(/fp:([a-z0-9]+)/i)?.[1]) ?? '?';
      return `secret:${f.path ?? '?'}|${fp}`;
    }
    case 'license':
      return `lic:${f.package ?? '?'}@${f.version ?? '?'}|${f.title}`;
    case 'config':
      return `config:${f.path ?? '?'}|${f.title}`;
  }
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function mergeTwo(existing: Finding, incoming: Finding): Finding {
  const minRank = Math.min(SEVERITY_RANK[existing.severity], SEVERITY_RANK[incoming.severity]);
  const maxRank = Math.max(SEVERITY_RANK[existing.severity], SEVERITY_RANK[incoming.severity]);
  // Prefer a cve-lite-validated fix version over a raw advisory fixedIn.
  const validated = existing.remediation?.validatedFixVersion ?? incoming.remediation?.validatedFixVersion;
  return {
    ...existing,
    sources: uniq([...existing.sources, ...incoming.sources]),
    rawBySource: { ...existing.rawBySource, ...incoming.rawBySource },
    severity: maxSeverity(existing.severity, incoming.severity),
    cvss: Math.max(existing.cvss ?? 0, incoming.cvss ?? 0) || undefined,
    advisoryIds: uniq([...existing.advisoryIds, ...incoming.advisoryIds]),
    references: uniq([...existing.references, ...incoming.references]),
    fixedIn: validated ?? existing.fixedIn ?? incoming.fixedIn,
    divergent: (maxRank - minRank) > 1 ? true : existing.divergent,
    remediation: existing.remediation ?? incoming.remediation,
    reachable: existing.reachable ?? incoming.reachable,
  };
}

export function mergeFindings(perSource: Map<string, Finding[]>): Finding[] {
  const byKey = new Map<string, Finding>();
  const aliasToKey = new Map<string, string>(); // advisoryId -> canonical group key

  for (const [sourceId, findings] of perSource) {
    for (const raw of findings) {
      const tagged: Finding = {
        ...raw,
        sources: uniq([...(raw.sources ?? []), sourceId]),
        rawBySource: { ...(raw.rawBySource ?? {}), [sourceId]: raw.rawBySource?.[sourceId] ?? raw },
      };

      // For vulnerability findings, look up any shared advisory id to find an
      // existing group before falling back to computeDedupKey. This handles
      // the case where two scanners report the same vuln with overlapping but
      // non-identical advisory id sets (e.g. pnpm-audit has CVE-X but no GHSA,
      // grype has GHSA-Y and CVE-X — they share CVE-X so must merge).
      let groupKey: string | undefined;
      for (const id of tagged.advisoryIds) {
        const hit = aliasToKey.get(id);
        if (hit) { groupKey = hit; break; }
      }
      if (!groupKey) groupKey = computeDedupKey(tagged);
      tagged.dedupKey = groupKey;

      const existing = byKey.get(groupKey);
      const finalFinding = existing ? mergeTwo(existing, tagged) : tagged;
      byKey.set(groupKey, finalFinding);

      // Register all advisory ids of the merged finding as aliases for this group
      // so subsequent findings can join via any shared id.
      for (const id of finalFinding.advisoryIds) {
        aliasToKey.set(id, groupKey);
      }
    }
  }

  return Array.from(byKey.values());
}
