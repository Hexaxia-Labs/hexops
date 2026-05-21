'use client';

function relTime(ts: string): string {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

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
    <div className="w-[280px] flex-shrink-0 border-r border-zinc-800 overflow-y-auto">
      {sorted.map((p) => {
        const state = deriveRailState(p);
        const isSelected = p.id === selected;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
              isSelected
                ? 'border-purple-600 bg-zinc-800/40'
                : 'border-transparent hover:bg-zinc-800/20'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate text-[13px] ${isSelected ? 'text-zinc-100' : 'text-zinc-300'}`}>
                  {p.name}
                </div>
                <div className="text-zinc-600 text-[10px] mt-0.5">
                  {p.scannedAt ? `scanned ${relTime(p.scannedAt)}` : 'never scanned'}
                </div>
              </div>
              <div className="shrink-0 mt-0.5">
                {state === 'not-scanned' && (
                  <span className="text-zinc-600 text-[10px]">—</span>
                )}
                {state === 'clean' && (
                  <span className="text-green-500 text-[11px]">✓ clean</span>
                )}
                {state === 'has-findings' && (
                  <span className="flex gap-1">
                    {p.critical > 0 && (
                      <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-medium">{p.critical}</span>
                    )}
                    {p.high > 0 && (
                      <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-[10px] font-medium">{p.high}</span>
                    )}
                    {p.medium > 0 && (
                      <span className="bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded text-[10px] font-medium">{p.medium}</span>
                    )}
                    {p.low > 0 && (
                      <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-medium">{p.low}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
