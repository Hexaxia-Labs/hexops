'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ShieldAlert, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CodeScanResult, CodeScanFinding, CodeScanSeverity } from '@/lib/code-scanner';

const SEVERITY_COLOR: Record<CodeScanSeverity, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low: 'bg-zinc-700 text-zinc-400 border-zinc-600',
};

const SEVERITY_DOT: Record<CodeScanSeverity, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-zinc-500',
};

const SEVERITY_ORDER: CodeScanSeverity[] = ['critical', 'high', 'medium', 'low'];

export function CodeScanSection({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<CodeScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/code-scan`, { method: 'POST' });
      if (res.ok) setResult(await res.json());
    } finally {
      setScanning(false);
    }
  }, [projectId]);

  const bySeverity = result
    ? SEVERITY_ORDER.reduce<Record<string, CodeScanFinding[]>>((acc, sev) => {
        acc[sev] = result.findings.filter(f => f.severity === sev);
        return acc;
      }, {} as Record<CodeScanSeverity, CodeScanFinding[]>)
    : null;

  const totalFindings = result?.findings.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {result && totalFindings === 0 && (
            <span className="flex items-center gap-1.5 text-green-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              No issues found
            </span>
          )}
          {result && totalFindings > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <ShieldAlert className="h-3.5 w-3.5" />
              {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
            </span>
          )}
          {result && (
            <span className="text-zinc-600">
              · {result.scannedFiles > 0 ? `${result.scannedFiles} files` : 'scanned'} in {result.duration}ms
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-zinc-400"
          onClick={runScan}
          disabled={scanning}
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', scanning && 'animate-spin')} />
          {scanning ? 'Scanning…' : result ? 'Re-scan' : 'Run Scan'}
        </Button>
      </div>

      {!result && !scanning && (
        <p className="text-xs text-zinc-600">
          Scan for hardcoded secrets, dangerous APIs, weak crypto, and misconfigurations.
        </p>
      )}

      {bySeverity && totalFindings > 0 && (
        <div className="space-y-2">
          {SEVERITY_ORDER.map(sev => {
            const items = bySeverity[sev];
            if (items.length === 0) return null;
            const key = sev;
            const isOpen = expanded === key;
            return (
              <div key={key} className="bg-zinc-800/50 rounded-md overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800/80"
                  onClick={() => setExpanded(isOpen ? null : key)}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full flex-shrink-0', SEVERITY_DOT[sev])} />
                    <span className="font-medium text-zinc-200 capitalize">{sev}</span>
                    <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 border', SEVERITY_COLOR[sev])}>
                      {items.length}
                    </Badge>
                  </span>
                  {isOpen ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />}
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-700/50 divide-y divide-zinc-800/50">
                    {items.map((f, i) => (
                      <div key={i} className="px-3 py-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-mono text-zinc-300 break-all">
                            {f.file}
                            <span className="text-zinc-600">:{f.line}</span>
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-500 flex-shrink-0">
                            {f.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-400">{f.message}</p>
                        <pre className="text-[10px] font-mono text-zinc-500 bg-zinc-900 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
                          {f.snippet}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
