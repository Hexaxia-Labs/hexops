'use client';

import type { PluginCardEntry } from '@/lib/security/plugins/runner';

const STATUS_TONE: Record<
  PluginCardEntry['card']['status'],
  { dot: string; text: string; border: string }
> = {
  enabled: {
    dot: 'bg-green-500',
    text: 'text-green-400',
    border: 'border-emerald-700/60',
  },
  disabled: {
    dot: 'bg-zinc-500',
    text: 'text-zinc-400',
    border: 'border-zinc-800',
  },
  'host-missing': {
    dot: 'bg-amber-500',
    text: 'text-amber-400',
    border: 'border-amber-700/60',
  },
  error: { dot: 'bg-red-500', text: 'text-red-400', border: 'border-red-700/60' },
};

export interface PluginCardProps {
  entry: PluginCardEntry;
}

export function PluginCard({ entry }: PluginCardProps) {
  const tone = STATUS_TONE[entry.card.status];

  return (
    <div
      className={`rounded-md border ${tone.border} bg-zinc-900/30 px-3 py-3 text-sm`}
    >
      <div className="flex items-center justify-between">
        <div className="font-medium text-zinc-100">{entry.name}</div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
          <span className={`text-xs ${tone.text}`}>{entry.card.status}</span>
        </div>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        SecurityPlugin ({entry.kind}) · {entry.card.headline}
      </div>
      {entry.card.detail && (
        <div className="mt-1 text-xs text-zinc-500">{entry.card.detail}</div>
      )}
      {entry.detailRoute && (
        <a
          href={entry.detailRoute}
          className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
        >
          Configure ↗
        </a>
      )}
    </div>
  );
}
