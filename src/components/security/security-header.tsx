'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ScanSourceId = 'pnpm-audit' | 'grype' | 'cve-lite';

export interface ScanMeter {
  done: number;
  total: number;
  active: number;        // currently in-flight count for this source
}

export interface OsvDbStatus {
  lastSync?: string;     // ISO timestamp; undefined if never synced
}

export interface SecurityHeaderProps {
  findingsCount: number;
  sourcesCount: number;
  lastScan: string | undefined;
  scanning: boolean;
  projectCount?: number;

  // NEW:
  meters?: Partial<Record<ScanSourceId, ScanMeter>>;  // only present meters are rendered
  osv?: OsvDbStatus;
  syncingOsv?: boolean;
  onSyncOsv?: () => void;
  onScan: (sources: ScanSourceId[] | 'all') => void;  // REPLACES onRescan
}

export function SecurityHeader({
  findingsCount,
  sourcesCount,
  lastScan,
  scanning,
  projectCount,
  meters,
  osv,
  syncingOsv,
  onSyncOsv,
  onScan,
}: SecurityHeaderProps) {
  const findingsLabel = findingsCount === 1 ? 'finding' : 'findings';
  const sourcesLabel = sourcesCount === 1 ? 'source' : 'sources';
  const lastScanLabel = lastScan
    ? `Last scan: ${new Date(lastScan).toLocaleString()}`
    : 'Never scanned';

  // Subtitle: scanning without meters → "Scanning…"; empty state; normal
  let subtitle: string;
  if (scanning && (!meters || Object.keys(meters).length === 0)) {
    subtitle = 'Scanning…';
  } else if (findingsCount === 0 && lastScan === undefined) {
    subtitle = `${projectCount ?? 0} projects · no scans cached yet`;
  } else {
    subtitle = `${findingsCount} ${findingsLabel} across ${sourcesCount} ${sourcesLabel}`;
  }

  const hasMeterData = meters && Object.keys(meters).length > 0;

  return (
    <header className="border-b border-zinc-800 px-6 py-4">
      {/* Top row: title + subtitle on left, actions on right */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Security</h1>
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{lastScanLabel}</span>

          {/* OSV DB button — inline status + sync */}
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700"
            onClick={onSyncOsv}
            disabled={syncingOsv || !onSyncOsv}
            title={osv?.lastSync ? `OSV DB last synced: ${new Date(osv.lastSync).toLocaleString()}` : 'OSV DB never synced'}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', syncingOsv && 'animate-spin')} />
            {syncingOsv ? 'Syncing OSV…' : 'Sync OSV DB'}
          </Button>

          {/* Scan button-group (no dropdown-menu in ui/) */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700"
              onClick={() => onScan('all')}
              disabled={scanning}
            >
              <Play className={cn('h-4 w-4 mr-2', scanning && 'animate-spin')} />
              {scanning ? 'Scanning…' : 'Scan All'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => onScan(['pnpm-audit'])}
              disabled={scanning}
              title="pnpm-audit only"
            >
              pnpm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => onScan(['grype'])}
              disabled={scanning}
              title="grype only"
            >
              grype
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => onScan(['cve-lite'])}
              disabled={scanning}
              title="cve-lite only"
            >
              cve-lite
            </Button>
          </div>
        </div>
      </div>

      {/* Meters strip — only shown when scanning and meters are populated */}
      {scanning && hasMeterData && (
        <div className="mt-3 space-y-1.5">
          {(['pnpm-audit', 'grype', 'cve-lite'] as ScanSourceId[]).map(sid => {
            const m = meters![sid];
            if (!m) return null;
            const pct = m.total === 0 ? 0 : Math.round((m.done / m.total) * 100);
            return (
              <div key={sid} className="flex items-center gap-3 text-xs">
                <div className="w-24 text-zinc-400 font-mono">{sid}</div>
                <div className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      sid === 'pnpm-audit' && 'bg-blue-500',
                      sid === 'grype' && 'bg-violet-500',
                      sid === 'cve-lite' && 'bg-emerald-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-16 text-right text-zinc-500 tabular-nums">
                  {m.done}/{m.total}{m.active > 0 && <span className="text-zinc-600"> · {m.active}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
