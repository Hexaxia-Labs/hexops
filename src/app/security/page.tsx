'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CveLiteOutput, ScanOptions } from '@/lib/security/sources/cve-lite';
import type { DbStatus } from '@/lib/security/cve-lite-db';
import type { FindingRow } from '@/lib/security/cve-lite-view';
import type { SourceResult } from '@/lib/security/types';
import { selectFixPlan, findingRows, deriveReachable } from '@/lib/security/cve-lite-view';
import { FleetProjectRail, type FleetProject } from '@/components/security/fleet-project-rail';
import { FixPlan } from '@/components/security/cve-lite/fix-plan';
import { CveLiteFindings } from '@/components/security/cve-lite/cve-lite-findings';
import { CveLiteToolbar } from '@/components/security/cve-lite/cve-lite-toolbar';
import { CveLiteScanControls } from '@/components/security/cve-lite/cve-lite-scan-controls';
import { CveLiteManage } from '@/components/security/cve-lite/cve-lite-manage';
import { SourceStrip } from '@/components/security/source-strip';
import { ConfirmDialog } from '@/components/security/cve-lite/confirm-dialog';
import { AUTO_APPLY_ENABLED } from '@/lib/auto-apply-flag';

interface ConfirmState { title: string; body: ReactNode; run: () => Promise<void> }

function SecurityHubInner() {
  const searchParams = useSearchParams();
  const initialProject = searchParams.get('project') ?? '';

  const [railProjects, setRailProjects] = useState<FleetProject[]>([]);
  const [allSources, setAllSources] = useState<Record<string, Record<string, SourceResult>>>({});
  const [selected, setSelected] = useState<string>(initialProject);
  const [report, setReport] = useState<CveLiteOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedOnly, setImportedOnly] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [options, setOptions] = useState<ScanOptions>({});
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/security/cve-lite/summary')
      .then(r => r.json())
      .then((d) => {
        const ps: FleetProject[] = (d.projects ?? []).sort(
          (a: FleetProject, b: FleetProject) => a.name.localeCompare(b.name)
        );
        setRailProjects(ps);
        if (!selected && ps.length) setSelected(ps[0].id);
      })
      .catch(() => {});

    fetch('/api/security/findings')
      .then(r => r.json())
      .then((d) => {
        const map: Record<string, Record<string, SourceResult>> = {};
        for (const p of d.projects ?? []) map[p.projectId] = p.sources ?? {};
        setAllSources(map);
      })
      .catch(() => {});

    fetch('/api/security/cve-lite/db-status')
      .then(r => r.json())
      .then(setDbStatus)
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (force = false) => {
    if (!selected) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (force) qs.set('force', 'true');
      if (options.minSeverity) qs.set('minSeverity', options.minSeverity);
      if (options.prodOnly) qs.set('prodOnly', 'true');
      if (options.onlyUsed) qs.set('onlyUsed', 'true');
      if (options.all) qs.set('all', 'true');
      const res = await fetch(`/api/security/cve-lite/${selected}?${qs.toString()}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setReport(await res.json());
      setScannedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'scan failed');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selected, options]);

  useEffect(() => { load(false); }, [load]);

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true); setError(null);
    try {
      await confirm.run();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'action failed');
    } finally {
      setBusy(false); setConfirm(null);
    }
  };

  const fixAll = () => setConfirm({
    title: 'Fix all direct dependencies?',
    body: (
      <>
        Runs <code>cve-lite --fix</code> in <b>{selected}</b>, rewriting package.json + lockfile
        (may reinstall). A rescan runs after. You may need to restart that project&apos;s dev server.
      </>
    ),
    run: async () => {
      const res = await fetch(`/api/security/cve-lite/${selected}/fix`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error ?? data.summary ?? `fix failed (HTTP ${res.status})`);
      await load(true);
    },
  });

  const applyOne = (row: FindingRow) => setConfirm({
    title: `Apply fix for ${row.package}?`,
    body: (
      <>
        Updates <b>{row.package}</b> {row.version ?? '?'} → <b>{row.validatedFixVersion}</b> via the
        patch pipeline{row.relationship === 'transitive' ? ' (flat override)' : ''}, then rescans.
      </>
    ),
    run: async () => {
      const res = await fetch(`/api/projects/${selected}/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packages: [{
            name: row.package,
            fromVersion: row.version,
            toVersion: row.validatedFixVersion,
            fixViaOverride: row.relationship === 'transitive',
          }],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `update failed (HTTP ${res.status})`);
      }
      await load(true);
    },
  });

  const installSkill = () => setConfirm({
    title: 'Generate cve-lite skill files?',
    body: (
      <>
        Runs <code>cve-lite install-skill</code> in <b>{selected}</b>, writing AI-assistant skill
        files into the project.
      </>
    ),
    run: async () => {
      const res = await fetch(`/api/security/cve-lite/${selected}/install-skill`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error ?? `install-skill failed (HTTP ${res.status})`);
    },
  });

  const visibleReport: CveLiteOutput | null = report && importedOnly
    ? { ...report, findings: (report.findings ?? []).filter(f => deriveReachable(f.usage) === true) }
    : report;
  const groups = visibleReport ? selectFixPlan(visibleReport) : [];
  const rows = visibleReport ? findingRows(visibleReport) : [];
  const selectedSources = allSources[selected] ?? {};

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <FleetProjectRail
        projects={railProjects}
        selected={selected}
        onSelect={setSelected}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <CveLiteToolbar
          hideSelector
          projectId={selected}
          projects={[]}
          selected={selected}
          onSelect={setSelected}
          scannedAt={scannedAt}
          importedOnly={importedOnly}
          onToggleImported={setImportedOnly}
          onRescan={() => load(true)}
        />
        <CveLiteScanControls options={options} onChange={setOptions} />
        <div className="flex items-center gap-4 flex-wrap text-xs border border-zinc-800 rounded-md px-3 py-2 bg-zinc-900/30">
          <CveLiteManage
            projectId={selected}
            dbStatus={dbStatus}
            onSynced={setDbStatus}
            onInstallSkill={installSkill}
          />
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <SourceStrip
            projectId={selected}
            sources={selectedSources}
            onRescan={() => load(true)}
          />
        </div>
        {loading && <div className="text-sm text-zinc-500">Scanning…</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}
        {!loading && !error && visibleReport && (
          <>
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Fix plan</h2>
              <FixPlan groups={groups} onFixAll={AUTO_APPLY_ENABLED ? fixAll : undefined} fixingAll={busy} />
            </section>
            <section>
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Findings</h2>
              <CveLiteFindings rows={rows} onApply={AUTO_APPLY_ENABLED ? applyOne : undefined} />
            </section>
          </>
        )}
        {confirm && (
          <ConfirmDialog
            open
            title={confirm.title}
            body={confirm.body}
            busy={busy}
            onConfirm={runConfirmed}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading…</div>}>
      <SecurityHubInner />
    </Suspense>
  );
}
