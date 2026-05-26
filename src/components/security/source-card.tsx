'use client';

import type { SourceResult } from '@/lib/security/types';

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  'pnpm-audit': 'pnpm-audit',
  grype: 'grype',
  'cve-lite': 'cve-lite',
};

const STATUS_TONE: Record<
  SourceResult['status'],
  { dot: string; text: string; border: string }
> = {
  ok: { dot: 'bg-green-500', text: 'text-green-400', border: 'border-zinc-800' },
  failed: {
    dot: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-red-700/60',
  },
  unavailable: {
    dot: 'bg-zinc-500',
    text: 'text-zinc-400',
    border: 'border-zinc-800 opacity-70',
  },
  timeout: {
    dot: 'bg-orange-500',
    text: 'text-orange-400',
    border: 'border-orange-700/60',
  },
};

export interface SourceCardProps {
  result: SourceResult;
  deepLinkHref?: string;
}

export function SourceCard({ result, deepLinkHref }: SourceCardProps) {
  const tone = STATUS_TONE[result.status];
  const display = SOURCE_DISPLAY_NAMES[result.id] ?? result.id;

  return (
    <div
      className={`rounded-md border ${tone.border} bg-zinc-900/30 px-3 py-3 text-sm`}
    >
      <div className="flex items-center justify-between">
        <div className="font-medium text-zinc-100">{display}</div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
          <span className={`text-xs ${tone.text}`}>{result.status}</span>
        </div>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        ScanSource · {result.findingCount} finding
        {result.findingCount === 1 ? '' : 's'} · {Math.round(result.durationMs)}
        ms
      </div>
      {deepLinkHref && (
        <a
          href={deepLinkHref}
          className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
        >
          Open dashboard ↗
        </a>
      )}
    </div>
  );
}
