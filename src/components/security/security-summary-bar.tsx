'use client';

export interface SecuritySummaryBarProps {
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info?: number;
  };
}

interface ChipDef {
  count: number;
  label: string;
  dot: string;
  text: string;
}

export function SecuritySummaryBar({ counts }: SecuritySummaryBarProps) {
  const chips: ChipDef[] = [
    { count: counts.critical, label: 'critical', dot: 'bg-red-500', text: 'text-red-400' },
    { count: counts.high, label: 'high', dot: 'bg-orange-500', text: 'text-orange-400' },
    { count: counts.medium, label: 'medium', dot: 'bg-yellow-500', text: 'text-yellow-400' },
    { count: counts.low, label: 'low', dot: 'bg-zinc-500', text: 'text-zinc-400' },
  ];
  const hasAny = chips.some((c) => c.count > 0);

  return (
    <div className="border-b border-zinc-800 px-6 py-3 bg-zinc-900/50">
      <div className="flex items-center gap-6">
        {chips.map((c) =>
          c.count > 0 ? (
            <div key={c.label} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span className={`text-sm ${c.text}`}>
                {c.count} {c.label}
              </span>
            </div>
          ) : null,
        )}
        {!hasAny && <span className="text-sm text-green-400">No findings</span>}
      </div>
    </div>
  );
}
