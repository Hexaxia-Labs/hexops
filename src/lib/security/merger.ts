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

export function mergeFindings(perSource: Map<string, Finding[]>): Finding[] {
  const byKey = new Map<string, Finding>();

  for (const [sourceId, findings] of perSource) {
    for (const raw of findings) {
      const tagged: Finding = {
        ...raw,
        sources: uniq([...(raw.sources ?? []), sourceId]),
        rawBySource: { ...(raw.rawBySource ?? {}), [sourceId]: raw.rawBySource?.[sourceId] ?? raw },
      };
      tagged.dedupKey = computeDedupKey(tagged);

      const existing = byKey.get(tagged.dedupKey);
      if (!existing) {
        byKey.set(tagged.dedupKey, tagged);
        continue;
      }

      const minRank = Math.min(SEVERITY_RANK[existing.severity], SEVERITY_RANK[tagged.severity]);
      const maxRank = Math.max(SEVERITY_RANK[existing.severity], SEVERITY_RANK[tagged.severity]);
      const merged: Finding = {
        ...existing,
        sources: uniq([...existing.sources, ...tagged.sources]),
        rawBySource: { ...existing.rawBySource, ...tagged.rawBySource },
        severity: maxSeverity(existing.severity, tagged.severity),
        cvss: Math.max(existing.cvss ?? 0, tagged.cvss ?? 0) || undefined,
        advisoryIds: uniq([...existing.advisoryIds, ...tagged.advisoryIds]),
        references: uniq([...existing.references, ...tagged.references]),
        fixedIn: existing.fixedIn ?? tagged.fixedIn,
        divergent: (maxRank - minRank) > 1 ? true : existing.divergent,
      };
      byKey.set(merged.dedupKey, merged);
    }
  }

  return Array.from(byKey.values());
}
