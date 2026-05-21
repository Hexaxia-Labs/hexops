'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ShieldCheck, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupplyChainResult, SupplyChainFinding, SupplyChainFindingType } from '@/lib/supply-chain-scanner';

const TYPE_LABEL: Record<SupplyChainFindingType, string> = {
  'install-script': 'Install Script',
  'signature-invalid': 'Invalid Signature',
  'typosquat-suspect': 'Typosquat',
  'dep-confusion': 'Dep Confusion',
  'manifest-tamper': 'Manifest Tamper',
  'maintainer-risk': 'Maintainer Risk',
  'provenance': 'Provenance',
  'blacklist': 'Blacklist',
};

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-orange-500',
  low: 'bg-zinc-500',
};

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-500/20 text-red-300 border-red-500/30',
  medium: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  low: 'bg-zinc-700 text-zinc-400 border-zinc-600',
};

function groupBySeverity(findings: SupplyChainFinding[]) {
  const groups: Record<string, SupplyChainFinding[]> = { high: [], medium: [], low: [] };
  for (const f of findings) groups[f.severity].push(f);
  return groups;
}

export function SupplyChainSection({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<SupplyChainResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/supply-scan`, { method: 'POST' });
      if (res.ok) setResult(await res.json());
    } finally {
      setScanning(false);
    }
  }, [projectId]);

  const groups = result ? groupBySeverity(result.findings) : null;
  const totalFindings = result?.findings.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {result && totalFindings === 0 && (
            <span className="flex items-center gap-1.5 text-green-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              No supply chain issues found
            </span>
          )}
          {result && totalFindings > 0 && (
            <span className="flex items-center gap-1.5 text-orange-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
            </span>
          )}
          {result && (
            <span className="text-zinc-600">
              · {result.scannedPackages} packages in {result.duration}ms
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
          Detect install scripts, invalid signatures, and typosquatted package names.
        </p>
      )}

      {groups && totalFindings > 0 && (
        <div className="space-y-2">
          {(['high', 'medium', 'low'] as const).map(sev => {
            const items = groups[sev];
            if (items.length === 0) return null;
            const isOpen = expanded === sev;
            return (
              <div key={sev} className="bg-zinc-800/50 rounded-md overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800/80"
                  onClick={() => setExpanded(isOpen ? null : sev)}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full flex-shrink-0', SEVERITY_DOT[sev])} />
                    <span className="font-medium text-zinc-200 capitalize">{sev}</span>
                    <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 border', SEVERITY_BADGE[sev])}>
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
                          <span className="text-xs font-mono text-zinc-200">
                            {f.package}
                            {f.version && <span className="text-zinc-600">@{f.version}</span>}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-500 flex-shrink-0">
                            {TYPE_LABEL[f.type]}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-400 break-all">{f.detail}</p>
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
