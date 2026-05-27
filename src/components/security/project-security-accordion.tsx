'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CveLiteOutput, ScanOptions } from '@/lib/security/sources/cve-lite';
import type { DbStatus } from '@/lib/security/cve-lite-db';
import type { FindingRow } from '@/lib/security/cve-lite-view';
import type { SourceResult, Finding } from '@/lib/security/types';
import { deriveParentPackage } from '@/lib/security/parent-package';
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
  severity?: { critical: number; high: number; medium: number; low: number; info?: number };
  findings?: Finding[];
  startsExpanded?: boolean;
  onAnyDataChanged?: () => void;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'border-red-500/30 text-red-400 bg-red-500/10',
  high: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
  medium: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  low: 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10',
  info: 'border-zinc-700 text-zinc-500 bg-zinc-900/40',
};

// ─── Severity rank (local copy to avoid importing the full types SEVERITY_RANK) ───
const SEVERITY_RANK_LOCAL: Record<string, number> = {
  critical: 4, high: 3, medium: 2, moderate: 2, low: 1, info: 0,
};

// ─── Package grouping types ───────────────────────────────────────────────────

interface PackageGroup {
  key: string;
  package: string;
  version?: string;
  findings: Finding[];
  worstSeverity: string;
  severityCounts: { critical: number; high: number; medium: number; low: number; info: number };
  fixedIn?: string;
  sourcesUnion: string[];
  /** Present when all findings in this group share the same parent npm package. */
  parentPackage?: string;
  /** The originally-reported package (e.g. 'stdlib') when grouped by parent. */
  reportedPackage?: string;
}

function groupFindingsForDisplay(findings: Finding[]): PackageGroup[] {
  const map = new Map<string, PackageGroup>();
  for (const f of findings) {
    const pkg = f.package ?? f.title;
    const ver = f.version;
    const parent = deriveParentPackage(f);
    // Group by parent when derivable AND different from the reported package
    const useParent = parent && parent !== pkg;
    const key = useParent ? `parent:${parent}` : `${pkg}@${ver ?? '?'}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        package: useParent ? parent! : pkg,
        version: useParent ? undefined : ver,
        findings: [],
        worstSeverity: 'info',
        severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        fixedIn: undefined,
        sourcesUnion: [],
        parentPackage: useParent ? parent! : undefined,
        reportedPackage: useParent ? pkg : undefined,
      };
      map.set(key, g);
    }
    g.findings.push(f);
    const s = (f.severity ?? 'info').toLowerCase();
    if ((SEVERITY_RANK_LOCAL[s] ?? 0) > (SEVERITY_RANK_LOCAL[g.worstSeverity] ?? 0)) {
      g.worstSeverity = s;
    }
    if (s === 'critical' || s === 'high' || s === 'low' || s === 'info') {
      g.severityCounts[s as keyof typeof g.severityCounts]++;
    } else if (s === 'medium' || s === 'moderate') {
      g.severityCounts.medium++;
    }
    if (!g.fixedIn && f.fixedIn) g.fixedIn = f.fixedIn;
    for (const src of f.sources) {
      if (!g.sourcesUnion.includes(src)) g.sourcesUnion.push(src);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const rb = SEVERITY_RANK_LOCAL[b.worstSeverity] ?? 0;
    const ra = SEVERITY_RANK_LOCAL[a.worstSeverity] ?? 0;
    if (ra !== rb) return rb - ra;
    if (b.findings.length !== a.findings.length) return b.findings.length - a.findings.length;
    return a.package.localeCompare(b.package);
  });
}

// ─── Hover text for native title attr (no HoverCard available) ───────────────

function buildHoverText(f: Finding): string {
  const parts: string[] = [];
  if (f.title) parts.push(f.title);
  if (f.detail && f.detail !== f.title) {
    parts.push(f.detail.slice(0, 400) + (f.detail.length > 400 ? '…' : ''));
  }
  if (f.cvss !== undefined) parts.push(`CVSS: ${f.cvss}`);
  if (f.references.length > 0) parts.push(`See: ${f.references.slice(0, 2).join(' · ')}`);
  return parts.join('\n\n');
}

// ─── FindingRow — individual CVE row ─────────────────────────────────────────

function FindingRow({ finding: f }: { finding: Finding }) {
  const sev = (f.severity ?? 'info').toLowerCase();
  return (
    <div className="flex items-center gap-2 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors px-3 py-2 rounded border border-zinc-800/60 text-xs">
      <span className={`shrink-0 px-1.5 py-0.5 rounded border ${SEVERITY_BADGE[sev] ?? SEVERITY_BADGE.info}`}>{sev}</span>
      <span className="text-zinc-200 font-medium truncate">{f.package ?? f.title}</span>
      {f.version && <span className="text-zinc-500 shrink-0">{f.version}</span>}
      {f.divergent && (
        <span className="shrink-0 px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10">
          divergent
        </span>
      )}
      <div className="ml-auto flex items-center gap-2 text-zinc-500 shrink-0">
        {f.advisoryIds.length > 0 && (
          <span
            title={buildHoverText(f)}
            className="truncate max-w-[280px] cursor-help"
          >
            {f.advisoryIds[0]}{f.advisoryIds.length > 1 ? ` +${f.advisoryIds.length - 1}` : ''}
          </span>
        )}
        <span className="opacity-75">{f.sources.join(' + ')}</span>
        {f.fixedIn && <span className="text-zinc-400">fix: {f.fixedIn}</span>}
      </div>
    </div>
  );
}

// ─── PackageRow — collapsible group for one package@version ──────────────────

function PackageRow({ group }: { group: PackageGroup }) {
  const [open, setOpen] = useState(false);
  const total = group.findings.length;
  return (
    <div className="border border-zinc-800/60 rounded overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(x => !x)}
        className="w-full flex items-center gap-2 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors px-3 py-2 text-xs text-left"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
        }
        <span className={`shrink-0 px-1.5 py-0.5 rounded border ${SEVERITY_BADGE[group.worstSeverity] ?? SEVERITY_BADGE.info}`}>
          {group.worstSeverity}
        </span>
        {group.parentPackage ? (
          <>
            <span className="text-zinc-200 font-medium truncate">{group.parentPackage}</span>
            <span className="text-zinc-500 shrink-0 text-[0.7rem]">via {group.reportedPackage}</span>
          </>
        ) : (
          <>
            <span className="text-zinc-200 font-medium truncate">{group.package}</span>
            {group.version && <span className="text-zinc-500 shrink-0">{group.version}</span>}
          </>
        )}
        <div className="flex items-center gap-1 ml-2">
          {group.severityCounts.critical > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/10">
              {group.severityCounts.critical}c
            </span>
          )}
          {group.severityCounts.high > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-orange-500/30 text-orange-400 bg-orange-500/10">
              {group.severityCounts.high}h
            </span>
          )}
          {group.severityCounts.medium > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
              {group.severityCounts.medium}m
            </span>
          )}
          {group.severityCounts.low > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-zinc-500/30 text-zinc-400 bg-zinc-500/10">
              {group.severityCounts.low}l
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 text-zinc-500 shrink-0">
          <span>{total} CVE{total !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span className="opacity-75">{group.sourcesUnion.join(' + ')}</span>
          {group.fixedIn && <span className="text-zinc-400">fix: {group.fixedIn}</span>}
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-800/60 bg-zinc-950/30 px-3 py-2 space-y-1">
          {group.findings.map(f => <FindingRow key={f.dedupKey} finding={f} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main accordion ───────────────────────────────────────────────────────────

export function ProjectSecurityAccordion({
  project,
  sources,
  severity,
  findings,
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

  // "All findings" section collapse state — open by default when ≤10 findings
  const [findingsExpanded, setFindingsExpanded] = useState(
    (findings?.length ?? 0) <= 10,
  );

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

  // Scan button handler: run 3-source security scan first (best-effort), then cve-lite scan.
  // Note: load(true) already calls onAnyDataChanged internally, so we don't call it again here.
  const scanRow = useCallback(async () => {
    if (!expanded) setExpanded(true);
    setLoading(true); setError(null);
    try {
      await fetch(`/api/projects/${project.id}/security-scan`, { method: 'POST' });
    } catch {
      // best-effort — proceed to cve-lite scan regardless
    }
    // load() manages loading state from here; setLoading(true) above covers the 3-source phase
    await load(true);
  }, [project.id, expanded, load]);

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

  // Compute severity pill total from severity prop (critical + high + medium + low; ignore info)
  const sev = severity;
  const totalSev = sev ? sev.critical + sev.high + sev.medium + sev.low : 0;

  // Memoised package groups for "All findings" section
  const packageGroups = useMemo(
    () => (findings && findings.length > 0 ? groupFindingsForDisplay(findings) : []),
    [findings],
  );

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
          {sev && totalSev > 0 ? (
            <div className="flex items-center gap-1.5">
              {sev.critical > 0 && (
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/10">
                  {sev.critical} critical
                </Badge>
              )}
              {sev.high > 0 && (
                <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400 bg-orange-500/10">
                  {sev.high} high
                </Badge>
              )}
              {sev.medium > 0 && (
                <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
                  {sev.medium} medium
                </Badge>
              )}
              {sev.low > 0 && (
                <Badge variant="outline" className="text-xs border-zinc-500/30 text-zinc-400 bg-zinc-500/10">
                  {sev.low} low
                </Badge>
              )}
            </div>
          ) : sev && totalSev === 0 ? (
            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/10">
              ✓ Clean
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={scanRow}
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
          {findings && findings.length > 0 && (
            <section>
              {/* Section-level collapse toggle */}
              <button
                type="button"
                onClick={() => setFindingsExpanded(x => !x)}
                className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors mb-2 px-1"
              >
                {findingsExpanded
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />
                }
                All findings ({findings.length})
              </button>
              {findingsExpanded && (
                <div className="space-y-1">
                  {packageGroups.slice(0, 30).map(g => (
                    <PackageRow key={g.key} group={g} />
                  ))}
                  {packageGroups.length > 30 && (
                    <div className="text-xs text-zinc-500 px-2 py-1">
                      + {packageGroups.length - 30} more package(s)
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
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

