'use client';
import Link from 'next/link';
import type { Finding } from '@/lib/security/types';
import { SeverityBadge } from './severity-badge';

interface Props {
  projectId: string;
  findings: Finding[];
}

const SOURCE_BADGE = 'px-1 py-0.5 text-[10px] rounded border bg-zinc-900 border-zinc-700 text-zinc-300';

export function FindingsTable({ projectId, findings }: Props) {
  if (findings.length === 0) {
    return <div className="text-sm text-zinc-500 py-6 text-center">No findings.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-zinc-500 uppercase border-b border-zinc-800">
        <tr><th className="text-left py-2">Type</th><th className="text-left">Package</th><th className="text-left">Title</th><th className="text-left">Severity</th><th className="text-left">Sources</th><th className="text-left">Fix</th></tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.dedupKey} className="border-b border-zinc-900 hover:bg-zinc-900/50">
            <td className="py-2 text-zinc-400">{f.type}</td>
            <td className="font-mono text-zinc-300">{f.package ? `${f.package}@${f.version ?? '?'}` : '—'}</td>
            <td className="text-zinc-200">
              {f.title}
              {f.divergent && <span className="ml-2 text-yellow-400" title="Sources disagree on severity by >1 level">⚠ divergent</span>}
            </td>
            <td><SeverityBadge severity={f.severity} /></td>
            <td>
              <span className="flex gap-1">
                {f.sources.map((s) => <span key={s} className={SOURCE_BADGE}>{s}</span>)}
              </span>
            </td>
            <td>
              {f.fixedIn ? (
                <Link className="text-blue-400 hover:underline text-xs" href={`/patches?project=${projectId}&pkg=${encodeURIComponent(f.package ?? '')}`}>Fix → {f.fixedIn}</Link>
              ) : <span className="text-zinc-600">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
