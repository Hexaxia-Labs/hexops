'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SecurityHeaderProps {
  findingsCount: number;
  sourcesCount: number;
  lastScan: string | undefined;
  scanning: boolean;
  scanProgress?: { done: number; total: number } | null;
  projectCount?: number;
  onRescan(): void;
}

export function SecurityHeader({
  findingsCount,
  sourcesCount,
  lastScan,
  scanning,
  scanProgress,
  projectCount,
  onRescan,
}: SecurityHeaderProps) {
  const findingsLabel = findingsCount === 1 ? 'finding' : 'findings';
  const sourcesLabel = sourcesCount === 1 ? 'source' : 'sources';
  const lastScanLabel = lastScan
    ? `Last scan: ${new Date(lastScan).toLocaleString()}`
    : 'Never scanned';

  // Subtitle: scanning progress > empty state > normal
  let subtitle: string;
  if (scanProgress != null && scanProgress.total > 0) {
    subtitle = `Scanning ${scanProgress.done}/${scanProgress.total} projects…`;
  } else if (findingsCount === 0 && lastScan === undefined) {
    subtitle = `${projectCount ?? 0} projects · no scans cached yet`;
  } else {
    subtitle = `${findingsCount} ${findingsLabel} across ${sourcesCount} ${sourcesLabel}`;
  }

  // Button label: scanning with progress > scanning without > idle
  const buttonLabel =
    scanning && scanProgress != null
      ? `Scanning ${scanProgress.done}/${scanProgress.total}...`
      : scanning
      ? 'Rescanning...'
      : 'Rescan';

  return (
    <header className="border-b border-zinc-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Security</h1>
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{lastScanLabel}</span>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700"
            onClick={onRescan}
            disabled={scanning}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', scanning && 'animate-spin')} />
            {buttonLabel}
          </Button>
        </div>
      </div>
    </header>
  );
}
