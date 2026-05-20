'use client';
import { useEffect, useState, useCallback } from 'react';
import type { Finding, ScanResult } from '@/lib/security/types';
import { FindingsTable } from '@/components/security/findings-table';
import { SourceStrip } from '@/components/security/source-strip';

interface ProjectFindings {
  projectId: string;
  projectName: string;
  timestamp: string | null;
  sources: ScanResult['sources'];
  findings: Finding[];
}

type TypeFilter = 'all' | Finding['type'];
type SeverityFilter = 'all' | Finding['severity'];

export default function SecurityPage() {
  const [data, setData] = useState<ProjectFindings[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sevFilter, setSevFilter] = useState<SeverityFilter>('all');

  const load = useCallback(async () => {
    const r = await fetch('/api/security/findings').then(x => x.json());
    setData(r.projects);
    if (!selected && r.projects.length > 0) setSelected(r.projects[0].projectId);
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const current = data.find(p => p.projectId === selected);
  const filtered = (current?.findings ?? []).filter(f =>
    (typeFilter === 'all' || f.type === typeFilter) &&
    (sevFilter === 'all' || f.severity === sevFilter)
  );

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <h1 className="text-xl font-semibold text-zinc-100">Security</h1>

      <div className="flex gap-4">
        <select value={selected ?? ''} onChange={(e) => setSelected(e.target.value)} className="bg-zinc-900 border border-zinc-700 text-sm rounded px-2 py-1">
          {data.map(p => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} className="bg-zinc-900 border border-zinc-700 text-sm rounded px-2 py-1">
          <option value="all">All types</option>
          <option value="vulnerability">Vulnerability</option>
          <option value="integrity">Integrity</option>
          <option value="secret">Secret</option>
          <option value="license">License</option>
          <option value="config">Config</option>
        </select>
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value as SeverityFilter)} className="bg-zinc-900 border border-zinc-700 text-sm rounded px-2 py-1">
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
      </div>

      {current && (
        <>
          <SourceStrip projectId={current.projectId} sources={current.sources} onRescan={load} />
          <FindingsTable projectId={current.projectId} findings={filtered} />
        </>
      )}
    </div>
  );
}
