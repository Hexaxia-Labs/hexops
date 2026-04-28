'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RefreshCw, Share2, AlertTriangle, Search, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';

interface DepEntry {
  name: string;
  count: number;
  isVulnerable: boolean;
  projects: Array<{ id: string; name: string; version: string; isDev: boolean }>;
}

interface DepsData {
  shared: DepEntry[];
  totalProjects: number;
  totalSharedDeps: number;
}

const TOOLTIP_STYLE = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 };

export default function DepsPage() {
  const [data, setData] = useState<DepsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deps');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setMounted(true); load(); }, []);

  const filtered = (data?.shared ?? []).filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const chartData = filtered.slice(0, 20).map(d => ({
    name: d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name,
    fullName: d.name,
    count: d.count,
    isVulnerable: d.isVulnerable,
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Dashboard
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-blue-400" />
              <h1 className="text-lg font-semibold">Dependency Graph</h1>
            </div>
            {data && (
              <span className="text-xs text-zinc-500">
                {data.totalSharedDeps} packages shared across {data.totalProjects} projects
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {loading && !data && (
          <div className="text-zinc-500 text-sm">Scanning project dependencies…</div>
        )}

        {data && (
          <>
            {/* Top packages bar chart */}
            {chartData.length > 0 && (
              <div className="bg-zinc-900 rounded-lg p-4">
                <h2 className="text-sm font-medium text-zinc-300 mb-4">Most shared packages (top 20)</h2>
                {mounted && (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 100, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} width={100} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: '#27272a' }}
                        formatter={(value) => [`${value} projects`, 'Used in']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                      />
                      <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.isVulnerable ? '#ef4444' : '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />Normal</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Has known vulnerability</span>
                </div>
              </div>
            )}

            {/* Search + table */}
            <div className="space-y-2">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter packages…"
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="bg-zinc-900 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Package</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Used in</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((dep) => (
                      <>
                        <tr
                          key={dep.name}
                          className={cn(
                            'border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30',
                            expanded === dep.name && 'bg-zinc-800/30'
                          )}
                          onClick={() => setExpanded(prev => prev === dep.name ? null : dep.name)}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {dep.isVulnerable && <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />}
                              <span className={cn('font-mono', dep.isVulnerable ? 'text-red-300' : 'text-zinc-200')}>{dep.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-zinc-400">{dep.count} project{dep.count !== 1 ? 's' : ''}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {dep.projects.slice(0, 5).map(p => (
                                <Badge key={p.id} variant="secondary" className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-400">
                                  {p.name}
                                </Badge>
                              ))}
                              {dep.projects.length > 5 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-500">
                                  +{dep.projects.length - 5}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded === dep.name && (
                          <tr key={`${dep.name}-expanded`} className="border-b border-zinc-800">
                            <td colSpan={3} className="px-3 py-2 bg-zinc-800/20">
                              <div className="flex flex-wrap gap-2">
                                {dep.projects.map(p => (
                                  <div key={p.id} className="flex items-center gap-1.5 bg-zinc-800 rounded px-2 py-1">
                                    <span className="text-zinc-300">{p.name}</span>
                                    <span className="font-mono text-zinc-500">{p.version}</span>
                                    {p.isDev && <span className="text-zinc-600 text-[10px]">dev</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-zinc-600">
                          No shared dependencies found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
