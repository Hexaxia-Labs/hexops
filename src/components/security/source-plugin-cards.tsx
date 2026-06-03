'use client';

import type { SourceResult } from '@/lib/security/types';
import type { PluginCardEntry } from '@/lib/security/plugins/types';
import { SourceCard } from './source-card';
import { PluginCard } from './plugin-card';

export interface SourcePluginCardsProps {
  sources: Record<string, SourceResult>;
  plugins: PluginCardEntry[];
  sourceDeepLinks?: Record<string, string>;
}

export function SourcePluginCards({
  sources,
  plugins,
  sourceDeepLinks,
}: SourcePluginCardsProps) {
  const sourceEntries = Object.values(sources);

  return (
    <div className="px-6 py-3 border-b border-zinc-800">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {sourceEntries.map((s) => (
          <SourceCard
            key={s.id}
            result={s}
            deepLinkHref={sourceDeepLinks?.[s.id]}
          />
        ))}
        {plugins.map((p) => (
          <PluginCard key={p.pluginId} entry={p} />
        ))}
      </div>
    </div>
  );
}
