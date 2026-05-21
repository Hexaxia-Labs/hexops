'use client';

export interface FleetProject {
  id: string;
  name: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  scannedAt: string | null;
}

export type RailState = 'not-scanned' | 'clean' | 'has-findings';

export function deriveRailState(p: FleetProject): RailState {
  if (p.scannedAt === null) return 'not-scanned';
  if (p.critical + p.high + p.medium + p.low === 0) return 'clean';
  return 'has-findings';
}

interface Props {
  projects: FleetProject[];
  selected: string;
  onSelect: (id: string) => void;
}

export function FleetProjectRail({ projects, selected, onSelect }: Props) {
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="w-[220px] flex-shrink-0 border-r border-zinc-800 overflow-y-auto">
      {sorted.map((p) => {
        const state = deriveRailState(p);
        const isSelected = p.id === selected;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 border-l-2 transition-colors ${
              isSelected
                ? 'border-purple-600 bg-zinc-800/40 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:bg-zinc-800/20 hover:text-zinc-300'
            }`}
          >
            <span className="flex-1 truncate font-medium">{p.name}</span>
            {state === 'not-scanned' && (
              <span className="text-zinc-600 shrink-0 text-[10px]">— not scanned</span>
            )}
            {state === 'clean' && (
              <span className="text-green-500 shrink-0">✓</span>
            )}
            {state === 'has-findings' && (
              <span className="flex gap-1 shrink-0">
                {p.critical > 0 && (
                  <span className="bg-red-500/20 text-red-400 px-1 rounded text-[10px]">{p.critical}</span>
                )}
                {p.high > 0 && (
                  <span className="bg-orange-500/20 text-orange-400 px-1 rounded text-[10px]">{p.high}</span>
                )}
                {p.medium > 0 && (
                  <span className="bg-yellow-500/20 text-yellow-400 px-1 rounded text-[10px]">{p.medium}</span>
                )}
                {p.low > 0 && (
                  <span className="bg-blue-500/20 text-blue-400 px-1 rounded text-[10px]">{p.low}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
