'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface ProjectOverride {
  projectId: string;
  projectName: string;
  package: string;
  version: string;
  packageManager: 'npm' | 'pnpm' | 'yarn';
  overrideKey: 'overrides' | 'pnpm.overrides' | 'resolutions';
  stale: boolean;
}

interface ActiveOverridesPanelProps {
  overrides: ProjectOverride[];
  onRemoved: () => void;
}

export function ActiveOverridesPanel({ overrides, onRemoved }: ActiveOverridesPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  if (overrides.length === 0) return null;

  const staleCount = overrides.filter(o => o.stale).length;

  const handleRemove = async (override: ProjectOverride) => {
    const key = `${override.projectId}:${override.package}`;
    setRemoving(key);
    try {
      const res = await fetch(`/api/projects/${override.projectId}/override-remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: override.package }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove override');
        return;
      }
      toast.success(`Removed override for ${override.package} in ${override.projectName}`);
      onRemoved();
    } catch {
      toast.error('Failed to remove override');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/30">
      <button
        className="w-full flex items-center gap-2 px-6 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
        <span className="text-xs font-medium text-zinc-400">
          Active Overrides ({overrides.length})
        </span>
        {staleCount > 0 && (
          <Badge variant="outline" className="text-xs h-4 px-1.5 border-amber-500/30 text-amber-400 bg-amber-500/10">
            {staleCount} stale
          </Badge>
        )}
        <span className="text-xs text-zinc-600 ml-1">
          — transitive dep pins written to package.json
        </span>
      </button>

      {expanded && (
        <div className="px-6 pb-3 space-y-1.5">
          {overrides.map((override) => {
            const key = `${override.projectId}:${override.package}`;
            const isRemoving = removing === key;
            return (
              <div
                key={key}
                className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2 text-sm',
                  override.stale
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-zinc-700/50 bg-zinc-800/30'
                )}
              >
                <span className="font-mono text-zinc-200 text-xs">{override.package}</span>
                <span className="text-zinc-500 text-xs">@{override.version}</span>
                <span className="text-zinc-600 text-xs">in</span>
                <span className="text-zinc-400 text-xs">{override.projectName}</span>
                <Badge variant="outline" className="text-xs h-4 px-1.5 border-zinc-600 text-zinc-500">
                  {override.overrideKey}
                </Badge>
                {override.stale && (
                  <Badge variant="outline" className="text-xs h-4 px-1.5 border-amber-500/30 text-amber-400 bg-amber-500/10">
                    stale
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                  disabled={isRemoving}
                  onClick={() => handleRemove(override)}
                  title={`Remove override for ${override.package}`}
                >
                  {isRemoving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
