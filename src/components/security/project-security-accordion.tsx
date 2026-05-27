'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CveLiteOutput, ScanOptions } from '@/lib/security/sources/cve-lite';
import type { DbStatus } from '@/lib/security/cve-lite-db';
import type { FindingRow } from '@/lib/security/cve-lite-view';
import type { SourceResult } from '@/lib/security/types';
import { selectFixPlan, findingRows, deriveReachable } from '@/lib/security/cve-lite-view';
import { FixPlan } from '@/components/security/cve-lite/fix-plan';
import { CveLiteFindings } from '@/components/security/cve-lite/cve-lite-findings';
import { CveLiteToolbar } from '@/components/security/cve-lite/cve-lite-toolbar';
import { CveLiteScanControls } from '@/components/security/cve-lite/cve-lite-scan-controls';
import { CveLiteManage } from '@/components/security/cve-lite/cve-lite-manage';
import { ConfirmDialog } from '@/components/security/cve-lite/confirm-dialog';
import { PendingCommitBanner } from '@/components/security/cve-lite/pending-commit-banner';
import { SourcePluginCards } from '@/components/security/source-plugin-cards';
import type { PluginCardEntry } from '@/lib/security/plugins/runner';
import { AUTO_APPLY_ENABLED } from '@/lib/auto-apply-flag';
import type { UpdatedPackage } from '@/lib/patch-commit-message';
import { generatePatchCommitMessage } from '@/lib/patch-commit-message';
import { remediationFromRow, remediationFromRows } from '@/lib/security/remediation-commit';

interface ConfirmState { title: string; body: ReactNode; run: () => Promise<void> }
interface GitStatus { branch: string; ahead: number; behind: number; dirty: boolean }
interface PendingCommit {
  packages: UpdatedPackage[];
  advisories: string[];
  severity?: string;
  message: string;
  isEditing: boolean;
}

export interface ProjectSecurityAccordionProps {
  project: { id: string; name: string };
  sources: Record<string, SourceResult>;
  startsExpanded?: boolean;
  onAnyDataChanged?: () => void;
}

export function ProjectSecurityAccordion({
  project,
  sources,
  startsExpanded = false,
  onAnyDataChanged,
}: ProjectSecurityAccordionProps) {
  const [expanded, setExpanded] = useState(startsExpanded);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Per-project CVE Lite state
  const [report, setReport] = useState<CveLiteOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedOnly, setImportedOnly] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [options, setOptions] = useState<ScanOptions>({});
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [pluginEntries, setPluginEntries] = useState<PluginCardEntry[]>([]);

  // Fetch db-status once on mount (lightweight)
  useEffect(() => {
    fetch('/api/security/cve-lite/db-status')
      .then(r => r.json())
      .then(setDbStatus)
      .catch(() => {});
  }, []);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (force) qs.set('force', 'true');
      if (options.minSeverity) qs.set('minSeverity', options.minSeverity);
      if (options.prodOnly) qs.set('prodOnly', 'true');
      if (options.onlyUsed) qs.set('onlyUsed', 'true');
      if (options.all) qs.set('all', 'true');
      const res = await fetch(`/api/security/cve-lite/${project.id}?${qs.toString()}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setReport(await res.json());
      setScannedAt(new Date().toISOString());
      setLoadedOnce(true);
      onAnyDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'scan failed');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [project.id, options, onAnyDataChanged]);

  // Lazy load: fetch when first expanded
  useEffect(() => {
    if (expanded && !loadedOnce) {
      load(false);
    }
  }, [expanded, loadedOnce, load]);

  // Fetch plugin status when expanded
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch('/api/security/plugins');
        if (!listRes.ok) return;
        const listJson = await listRes.json();
        const plugins: Array<{ id: string; name: string; kind: PluginCardEntry['kind']; detailRoute?: string }>
          = listJson.plugins ?? [];
        const entries = await Promise.all(
          plugins.map(async (p) => {
            const r = await fetch(`/api/security/plugins/${p.id}/status?projectId=${encodeURIComponent(project.id)}`);
            if (!r.ok) return null;
            const j = await r.json();
            return {
              pluginId: j.pluginId,
              name: p.name,
              kind: p.kind,
              host: j.host,
              card: j.card,
              detailRoute: p.detailRoute,
            } as PluginCardEntry;
          }),
        );
        if (!cancelled) {
          setPluginEntries(entries.filter((e): e is PluginCardEntry => e !== null));
        }
      } catch {
        if (!cancelled) setPluginEntries([]);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, project.id]);

  // Reset pending commit state when collapsed
  useEffect(() => {
    if (!expanded) {
      setPendingCommit(null);
      setCommitted(false);
      setGitStatus(null);
    }
  }, [expanded]);

  const fetchGitStatus = useCallback(async (): Promise<GitStatus | null> => {
    try {
      const res = await fetch(`/api/projects/${project.id}/git`);
      if (!res.ok) return null;
      const d = await res.json();
      return { branch: d.branch ?? '', ahead: d.aheadCount ?? 0, behind: d.behindCount ?? 0, dirty: !!d.isDirty };
    } catch {
      return null;
    }
  }, [project.id]);

  const beginPendingCommit = useCallback(
    async (rc: { packages: UpdatedPackage[]; advisories: string[]; severity?: string }) => {
      const status = await fetchGitStatus();
      setGitStatus(status);
      if (!status?.dirty) {
        setPendingCommit(null);
        setCommitted(false);
        setError('Fix ran, but there were no file changes to commit. A transitive advisory cannot be fixed by "Fix all direct" — use the per-finding Apply, which adds a package override.');
        return;
      }
      setError(null);
      const generated = generatePatchCommitMessage(rc.packages).full;
      const message = generated || `chore(deps): apply cve-lite fixes in ${project.id}`;
      setPendingCommit({ ...rc, message, isEditing: false });
      setCommitted(false);
    },
    [project.id, fetchGitStatus],
  );

  const handleCommit = useCallback(async () => {
    if (!pendingCommit) return;
    setIsCommitting(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git-commit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pendingCommit.message, source: 'cve-lite', advisories: pendingCommit.advisories }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { success?: boolean }).success === false) throw new Error((data as { error?: string }).error ?? `commit failed (HTTP ${res.status})`);
      setCommitted(true);
      setPendingCommit((pc) => (pc ? { ...pc, isEditing: false } : pc));
      setGitStatus(await fetchGitStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'commit failed');
    } finally {
      setIsCommitting(false);
    }
  }, [pendingCommit, project.id, fetchGitStatus]);

  const handlePush = useCallback(async () => {
    if (!pendingCommit) return;
    setIsPushing(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/git-push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'cve-lite', advisories: pendingCommit.advisories }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { success?: boolean }).success === false) throw new Error((data as { error?: string }).error ?? `push failed (HTTP ${res.status})`);
      setPendingCommit(null); setCommitted(false);
      setGitStatus(await fetchGitStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'push failed');
    } finally {
      setIsPushing(false);
    }
  }, [pendingCommit, project.id, fetchGitStatus]);

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
        Runs <code>cve-lite --fix</code> in <b>{project.name}</b>, rewriting package.json + lockfile
        (may reinstall). A rescan runs after. You may need to restart that project&apos;s dev server.
      </>
    ),
    run: async () => {
      const rc = remediationFromRows(report ? findingRows(report) : []);
      const res = await fetch(`/api/security/cve-lite/${project.id}/fix`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all', auditContext: { source: 'cve-lite', advisories: rc.advisories, severity: rc.severity } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { ok?: boolean }).ok === false) throw new Error((data as { error?: string; summary?: string }).error ?? (data as { summary?: string }).summary ?? `fix failed (HTTP ${res.status})`);
      await load(true);
      await beginPendingCommit(rc);
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
      const rc = remediationFromRow(row);
      const res = await fetch(`/api/projects/${project.id}/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packages: [{
            name: row.package,
            fromVersion: row.version,
            toVersion: row.validatedFixVersion,
            fixViaOverride: row.relationship === 'transitive',
          }],
          auditContext: { source: 'cve-lite', advisories: rc.advisories, severity: rc.severity },
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `update failed (HTTP ${res.status})`);
      }
      await load(true);
      await beginPendingCommit(rc);
    },
  });

  const installSkill = () => setConfirm({
    title: 'Generate cve-lite skill files?',
    body: (
      <>
        Runs <code>cve-lite install-skill</code> in <b>{project.name}</b>, writing AI-assistant skill
        files into the project.
      </>
    ),
    run: async () => {
      const res = await fetch(`/api/security/cve-lite/${project.id}/install-skill`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { ok?: boolean }).ok === false) throw new Error((data as { error?: string }).error ?? `install-skill failed (HTTP ${res.status})`);
    },
  });

  // Derived view
  const visibleReport: CveLiteOutput | null = report && importedOnly
    ? { ...report, findings: (report.findings ?? []).filter(f => deriveReachable(f.usage) === true) }
    : report;
  const groups = visibleReport ? selectFixPlan(visibleReport) : [];
  const rows = visibleReport ? findingRows(visibleReport) : [];

  // Total findings count: from parent-provided sources when not yet loaded, from report when available
  const totalFindings = loadedOnce
    ? (visibleReport?.findings ?? []).length
    : Object.values(sources).reduce((sum, s) => sum + s.findingCount, 0);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-center bg-zinc-900/50 hover:bg-zinc-900 transition-colors px-4 py-3">
        <div className="flex items-center gap-3 flex-1">
          <button
            type="button"
            onClick={() => setExpanded(x => !x)}
            className="flex items-center"
          >
            {expanded
              ? <ChevronDown className="h-4 w-4 text-zinc-500" />
              : <ChevronRight className="h-4 w-4 text-zinc-500" />
            }
          </button>
          <span className="font-medium text-zinc-200">{project.name}</span>
          {totalFindings > 0 ? (
            <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-500">
              {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/10">
              ✓ Clean
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (!expanded) setExpanded(true);
              load(true);
            }}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
            Scan
          </Button>
        </div>
      </div>

      {/* Body — only when expanded */}
      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-950/30 px-4 py-3 space-y-3">
          <SourcePluginCards
            sources={sources}
            plugins={pluginEntries}
            sourceDeepLinks={{ 'cve-lite': '/security' }}
          />
          <CveLiteToolbar
            hideSelector
            projectId={project.id}
            projects={[]}
            selected={project.id}
            onSelect={() => {}}
            scannedAt={scannedAt}
            importedOnly={importedOnly}
            onToggleImported={setImportedOnly}
            onRescan={() => load(true)}
          />
          <CveLiteScanControls options={options} onChange={setOptions} />
          <div className="flex items-center gap-4 flex-wrap text-xs border border-zinc-800 rounded-md px-3 py-2 bg-zinc-900/30">
            <CveLiteManage
              projectId={project.id}
              dbStatus={dbStatus}
              onSynced={setDbStatus}
              onInstallSkill={installSkill}
            />
          </div>
          {pendingCommit && AUTO_APPLY_ENABLED && (
            <PendingCommitBanner
              packages={pendingCommit.packages}
              message={pendingCommit.message}
              isEditing={pendingCommit.isEditing}
              ahead={gitStatus?.ahead ?? 0}
              committed={committed}
              isCommitting={isCommitting}
              isPushing={isPushing}
              onMessageChange={(msg) => setPendingCommit((pc) => (pc ? { ...pc, message: msg } : pc))}
              onToggleEdit={() => setPendingCommit((pc) => (pc ? { ...pc, isEditing: !pc.isEditing } : pc))}
              onCommit={handleCommit}
              onPush={handlePush}
              onDismiss={() => { setPendingCommit(null); setCommitted(false); }}
            />
          )}
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
      )}
    </div>
  );
}
