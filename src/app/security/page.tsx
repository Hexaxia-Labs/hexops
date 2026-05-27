'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SecurityHeader } from '@/components/security/security-header';
import { SecuritySummaryBar } from '@/components/security/security-summary-bar';
import { ProjectSecurityAccordion } from '@/components/security/project-security-accordion';
import type { SourceResult } from '@/lib/security/types';

interface ProjectsResponse { projects: Array<{ id: string; name: string }> }

function SecurityHubInner() {
  const searchParams = useSearchParams();
  const initialProject = searchParams.get('project') ?? '';

  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [perProjectSources, setPerProjectSources] = useState<Record<string, Record<string, SourceResult>>>({});
  const [allFindingsSeverity, setAllFindingsSeverity] = useState<{
    critical: number; high: number; medium: number; low: number; info: number;
  }>({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [projectsRes, findingsRes] = await Promise.all([
        fetch('/api/projects').then(r => r.json() as Promise<ProjectsResponse>),
        fetch('/api/security/findings').then(r => r.json()),
      ]);
      // Project list — sorted alphabetically for stable ordering
      const ps = ((projectsRes as ProjectsResponse).projects ?? []).sort(
        (a: { id: string; name: string }, b: { id: string; name: string }) => a.name.localeCompare(b.name)
      );
      setProjects(ps);

      // Per-project source map for the accordion headers
      const sourcesMap: Record<string, Record<string, SourceResult>> = {};
      const sev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const p of (findingsRes as { projects?: Array<{ projectId: string; sources?: Record<string, SourceResult>; findings?: Array<{ severity?: string }> }> }).projects ?? []) {
        sourcesMap[p.projectId] = p.sources ?? {};
        for (const f of p.findings ?? []) {
          const s = (f.severity ?? '').toLowerCase();
          if (s === 'critical') sev.critical++;
          else if (s === 'high') sev.high++;
          else if (s === 'medium' || s === 'moderate') sev.medium++;
          else if (s === 'low') sev.low++;
          else sev.info++;
        }
      }
      setPerProjectSources(sourcesMap);
      setAllFindingsSeverity(sev);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const findingsCount = useMemo(
    () => allFindingsSeverity.critical + allFindingsSeverity.high + allFindingsSeverity.medium + allFindingsSeverity.low,
    [allFindingsSeverity],
  );

  const lastScan = useMemo(
    () => {
      // Pick the latest startedAt across all sources, fall back to undefined.
      let latest: string | undefined;
      for (const proj of Object.values(perProjectSources)) {
        for (const src of Object.values(proj)) {
          if (!latest || (src.startedAt && src.startedAt > latest)) latest = src.startedAt;
        }
      }
      return latest;
    },
    [perProjectSources],
  );

  // Count of unique sources across the fleet (e.g. pnpm-audit, grype, cve-lite)
  const sourcesCount = useMemo(
    () => new Set(Object.values(perProjectSources).flatMap(o => Object.keys(o))).size,
    [perProjectSources],
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <SecurityHeader
        findingsCount={findingsCount}
        sourcesCount={sourcesCount}
        lastScan={lastScan}
        scanning={refreshing}
        onRescan={refresh}
      />
      <SecuritySummaryBar counts={allFindingsSeverity} />
      <div className="flex-1 overflow-auto p-6 space-y-3">
        {projects.length === 0 ? (
          <div className="text-sm text-zinc-500">{refreshing ? 'Loading projects…' : 'No projects.'}</div>
        ) : (
          projects.map(p => (
            <ProjectSecurityAccordion
              key={p.id}
              project={p}
              sources={perProjectSources[p.id] ?? {}}
              startsExpanded={p.id === initialProject}
              onAnyDataChanged={refresh}
            />
          ))
        )}
      </div>
    </main>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <SecurityHubInner />
    </Suspense>
  );
}
