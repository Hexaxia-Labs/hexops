'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SecurityHeader, type ScanSourceId } from '@/components/security/security-header';
import { SecuritySummaryBar } from '@/components/security/security-summary-bar';
import { ProjectSecurityAccordion } from '@/components/security/project-security-accordion';
import type { SourceResult } from '@/lib/security/types';
import { mapWithConcurrency } from '@/lib/concurrency';

interface ProjectsResponse { projects: Array<{ id: string; name: string }> }

interface FleetScanState {
  meters: Partial<Record<ScanSourceId, { done: number; total: number; active: number }>>;
  inflight: boolean;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type SeverityCounts = Record<Severity, number>;

function SecurityHubInner() {
  const searchParams = useSearchParams();
  const initialProject = searchParams.get('project') ?? '';

  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [perProjectSources, setPerProjectSources] = useState<Record<string, Record<string, SourceResult>>>({});
  const [perProjectSeverity, setPerProjectSeverity] = useState<Record<string, SeverityCounts>>({});
  const [allFindingsSeverity, setAllFindingsSeverity] = useState<{
    critical: number; high: number; medium: number; low: number; info: number;
  }>({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

  const [fleetScan, setFleetScan] = useState<FleetScanState>({ meters: {}, inflight: false });
  const [osv, setOsv] = useState<{ lastSync?: string }>({});
  const [syncingOsv, setSyncingOsv] = useState(false);

  const refresh = useCallback(async () => {
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

      // Per-project source map for the accordion headers, and per-project severity counts
      const sourcesMap: Record<string, Record<string, SourceResult>> = {};
      const perProj: Record<string, SeverityCounts> = {};
      const sev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const p of (findingsRes as { projects?: Array<{ projectId: string; sources?: Record<string, SourceResult>; findings?: Array<{ severity?: string }> }> }).projects ?? []) {
        sourcesMap[p.projectId] = p.sources ?? {};
        const c: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const f of p.findings ?? []) {
          const s = (f.severity ?? '').toLowerCase();
          if (s === 'critical') { c.critical++; sev.critical++; }
          else if (s === 'high') { c.high++; sev.high++; }
          else if (s === 'medium' || s === 'moderate') { c.medium++; sev.medium++; }
          else if (s === 'low') { c.low++; sev.low++; }
          else { c.info++; sev.info++; }
        }
        perProj[p.projectId] = c;
      }
      setPerProjectSources(sourcesMap);
      setPerProjectSeverity(perProj);
      setAllFindingsSeverity(sev);
    } catch {
      // best-effort — leave previous state intact on network error
    }
  }, []);

  // Fetch OSV DB status on mount
  useEffect(() => {
    fetch('/api/security/cve-lite/db-status')
      .then(r => r.json())
      .then((d: { builtAt?: string; lastSync?: string; mtime?: string; timestamp?: string }) =>
        setOsv({ lastSync: d?.builtAt ?? d?.lastSync ?? d?.mtime ?? d?.timestamp ?? undefined })
      )
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onSyncOsv = useCallback(async () => {
    setSyncingOsv(true);
    try {
      const res = await fetch('/api/security/cve-lite/sync', { method: 'POST' });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        setOsv({ lastSync: j?.builtAt ?? j?.lastSync ?? new Date().toISOString() });
      }
    } finally {
      setSyncingOsv(false);
    }
  }, []);

  const onScan = useCallback(async (sources: ScanSourceId[] | 'all') => {
    if (projects.length === 0) {
      // No projects loaded yet — fall back to cache-only refresh
      await refresh();
      return;
    }
    const sourceIds: ScanSourceId[] = sources === 'all'
      ? ['pnpm-audit', 'grype', 'cve-lite']
      : sources;
    const query = sources === 'all' ? '' : `?sources=${sourceIds.join(',')}`;

    // Initialize meters
    const initial: FleetScanState = {
      inflight: true,
      meters: Object.fromEntries(sourceIds.map(s => [s, { done: 0, total: projects.length, active: 0 }])),
    };
    setFleetScan(initial);

    try {
      await mapWithConcurrency(projects, 3, async (p) => {
        // Mark this project as active for all requested sources
        setFleetScan(prev => ({
          ...prev,
          meters: Object.fromEntries(
            Object.entries(prev.meters).map(([sid, m]) => [sid, { ...m!, active: (m!.active ?? 0) + 1 }]),
          ),
        }));
        let result: { sources?: Record<string, unknown> } = {};
        try {
          const res = await fetch(`/api/projects/${p.id}/security-scan${query}`, { method: 'POST' });
          if (res.ok) result = await res.json();
        } catch {/* best-effort */}
        // Tick done for each source returned in the response (or each requested source if response missing)
        const respondedSources = result.sources ? Object.keys(result.sources) : sourceIds;
        setFleetScan(prev => ({
          ...prev,
          meters: Object.fromEntries(
            Object.entries(prev.meters).map(([sid, m]) => {
              const ticked = respondedSources.includes(sid);
              return [sid, { ...m!, active: Math.max(0, (m!.active ?? 0) - 1), done: m!.done + (ticked ? 1 : 0) }];
            }),
          ),
        }));
      });
      await refresh();  // pull updated findings into the page state
    } finally {
      setFleetScan({ meters: {}, inflight: false });
    }
  }, [projects, refresh]);

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
        scanning={fleetScan.inflight}
        projectCount={projects.length}
        meters={fleetScan.meters}
        osv={osv}
        syncingOsv={syncingOsv}
        onSyncOsv={onSyncOsv}
        onScan={onScan}
      />
      <SecuritySummaryBar counts={allFindingsSeverity} />
      <div className="flex-1 overflow-auto p-6 space-y-3">
        {projects.length === 0 ? (
          <div className="text-sm text-zinc-500">{fleetScan.inflight ? 'Scanning…' : 'No projects.'}</div>
        ) : (
          projects.map(p => (
            <ProjectSecurityAccordion
              key={p.id}
              project={p}
              sources={perProjectSources[p.id] ?? {}}
              severity={perProjectSeverity[p.id]}
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
