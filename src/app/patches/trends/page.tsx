'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

interface WeekBucket {
  week: string;
  success: number;
  failure: number;
  total: number;
  uniquePackages: number;
}

interface ProjectBreakdown {
  id: string;
  name: string;
  total: number;
  success: number;
  successRate: number;
}

interface TrendsData {
  weeks: WeekBucket[];
  kpis: {
    totalPatches: number;
    successRate: number;
    avgPerWeek: number;
  };
  projectBreakdown: ProjectBreakdown[];
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const TICK_STYLE = { fill: '#71717a', fontSize: 11 };
const TOOLTIP_STYLE = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 };

export default function PatchTrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/patches/trends');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/patches">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Patches
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-400" />
              <h1 className="text-lg font-semibold">Patch Trends</h1>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {loading && !data && (
          <div className="text-zinc-500 text-sm">Loading trends…</div>
        )}

        {data && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-4">
              <KpiCard label="Total patches" value={data.kpis.totalPatches} />
              <KpiCard label="Success rate" value={`${data.kpis.successRate}%`} />
              <KpiCard label="Avg per week" value={data.kpis.avgPerWeek} sub="(last 26 weeks)" />
            </div>

            {/* Weekly activity chart */}
            {data.weeks.length > 0 ? (
              <div className="bg-zinc-900 rounded-lg p-4">
                <h2 className="text-sm font-medium text-zinc-300 mb-4">Weekly patch activity</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.weeks} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="week"
                      tick={TICK_STYLE}
                      tickFormatter={(v: string) => v.slice(5)}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={TICK_STYLE} allowDecimals={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={(value, name) => [value, name === 'success' ? 'Succeeded' : 'Failed']}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }}
                      formatter={(v: string) => v === 'success' ? 'Succeeded' : 'Failed'}
                    />
                    <Bar dataKey="success" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="failure" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-lg p-8 text-center text-zinc-500 text-sm">
                No patch history yet. Apply some patches to see trends.
              </div>
            )}

            {/* Per-project breakdown */}
            {data.projectBreakdown.length > 0 && (
              <div className="bg-zinc-900 rounded-lg p-4">
                <h2 className="text-sm font-medium text-zinc-300 mb-3">Per-project breakdown</h2>
                <div className="space-y-2">
                  {data.projectBreakdown.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-300 w-40 truncate flex-shrink-0">{p.name}</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${p.successRate}%`,
                            backgroundColor: p.successRate >= 80 ? '#22c55e' : p.successRate >= 50 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 w-20 text-right flex-shrink-0">
                        {p.success}/{p.total} ({p.successRate}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
