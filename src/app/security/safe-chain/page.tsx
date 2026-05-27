'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectConfig } from '@/lib/types';
import type { PluginCardData, PluginHostStatus } from '@/lib/security/plugins/types';

interface PerProjectEntry {
  project: ProjectConfig;
  status: PluginCardData | null;
  host: PluginHostStatus | null;
}

export default function SafeChainPage() {
  const [host, setHost] = useState<PluginHostStatus | null>(null);
  const [entries, setEntries] = useState<PerProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectsRes = await fetch('/api/projects');
      if (!projectsRes.ok) throw new Error(`projects fetch failed: ${projectsRes.status}`);
      const projectsJson = await projectsRes.json();
      const projects: ProjectConfig[] = projectsJson.projects ?? [];

      const pluginsRes = await fetch('/api/security/plugins');
      if (pluginsRes.ok) {
        const pluginsJson = await pluginsRes.json();
        const sc = (pluginsJson.plugins ?? []).find(
          (p: { id: string; host: PluginHostStatus }) => p.id === 'safe-chain',
        );
        setHost(sc?.host ?? null);
      }

      const perProject = await Promise.all(
        projects.map(async (p) => {
          try {
            const r = await fetch(
              `/api/security/plugins/safe-chain/status?projectId=${encodeURIComponent(p.id)}`,
            );
            if (!r.ok) return { project: p, status: null, host: null };
            const j = await r.json();
            return {
              project: p,
              status: j.card as PluginCardData,
              host: j.host as PluginHostStatus,
            };
          } catch {
            return { project: p, status: null, host: null };
          }
        }),
      );
      setEntries(perProject);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'refresh failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (projectId: string, next: boolean) => {
      setTogglingId(projectId);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/plugins/safe-chain`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: next }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error ?? `toggle failed (HTTP ${res.status})`);
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'toggle failed');
      } finally {
        setTogglingId(null);
      }
    },
    [refresh],
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Header strip */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Aikido Safe Chain</h1>
            <p className="text-xs text-zinc-500 mt-1">Pre-install malware/typosquat interceptor</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/security"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              ← Security
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Host status section */}
      <section className="border-b border-zinc-800 px-6 py-4 space-y-2">
        <h2 className="text-sm font-medium text-zinc-300">Host status</h2>
        {!host ? (
          <div className="text-sm text-zinc-500">Checking…</div>
        ) : host.available ? (
          <div className="text-sm text-zinc-300">
            ✓ <code>safe-chain</code> available{' '}
            {host.version && <span className="text-zinc-500">v{host.version}</span>}
          </div>
        ) : (
          <>
            <div className="text-sm text-amber-300">✗ not installed — {host.reason}</div>
            {host.installHint && (
              <div className="mt-1 text-zinc-400 text-xs">{host.installHint}</div>
            )}
          </>
        )}
      </section>

      {/* Error strip */}
      {error && <div className="px-6 py-2 text-sm text-red-400">{error}</div>}

      {/* Per-project enable section (scrollable) */}
      <div className="flex-1 overflow-auto">
        <section className="px-6 py-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Per-project enable</h2>
          {entries.length === 0 ? (
            loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : (
              <div className="text-sm text-zinc-500">No projects.</div>
            )
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium w-32"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ project, status, host: entryHost }) => {
                  const enabled = status?.status === 'enabled';
                  const hostMissing = entryHost != null && !entryHost.available;
                  return (
                    <tr key={project.id} className="border-b border-zinc-800/60">
                      <td className="py-2 pr-4 text-zinc-200">{project.name}</td>
                      <td className="py-2 pr-4 text-zinc-400">
                        {status ? `${status.status} · ${status.headline}` : '…'}
                      </td>
                      <td className="py-2 pr-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-zinc-700"
                          onClick={() => toggle(project.id, !enabled)}
                          disabled={hostMissing || togglingId === project.id}
                        >
                          {togglingId === project.id ? '…' : enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
