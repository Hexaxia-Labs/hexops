'use client';

import { Button } from '@/components/ui/button';

export interface RemediationPanelProps {
  parentPackage?: string;
  reportedPackage: string;
  currentVersion?: string;
  fixedIn?: string;
  cveCount: number;
  sources: string[];
  references: string[];
  isParentEmbedded: boolean;
  projectId: string;
  onApplyFix(): void;
  onOverridePin(): void;
  onViewReferences(): void;
}

const PRIMARY_SCOPE: Record<string, string> = {
  'pnpm-audit': 'lockfile',
  'cve-lite':   'lockfile',
  'grype':      'filesystem/binary',
};

function inferSourceLabel(sources: string[]): string {
  const scopes = new Set(sources.map(s => PRIMARY_SCOPE[s] ?? s));
  return Array.from(scopes).join(' + ');
}

export function RemediationPanel({
  parentPackage,
  reportedPackage,
  currentVersion,
  fixedIn,
  cveCount,
  sources,
  references,
  isParentEmbedded,
  projectId,
  onApplyFix,
  onOverridePin,
  onViewReferences,
}: RemediationPanelProps) {
  const refCount = references.length;
  const sourceLabel = inferSourceLabel(sources);

  // Build a /patches deep-link. /patches today doesn't honor a package filter
  // param, but project= already deep-links and we use the npm package name as
  // an anchor hint so the operator can scroll/find the row.
  const targetPkgName = parentPackage ?? reportedPackage;
  const patchesHref = `/patches?project=${encodeURIComponent(projectId)}#pkg-${encodeURIComponent(targetPkgName)}`;

  return (
    <div className="bg-zinc-900/40 border border-zinc-700/50 rounded p-3 mb-3 text-xs space-y-2">
      <div className="text-zinc-300 font-medium uppercase tracking-wide text-[0.65rem]">Remediation</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-300">
        <div>
          <span className="text-zinc-500">Detected via:</span>{' '}
          <span className="font-mono">{sourceLabel}</span>
        </div>
        <div>
          <span className="text-zinc-500">Total CVEs:</span> {cveCount}
        </div>
        {parentPackage && parentPackage !== reportedPackage ? (
          <>
            <div>
              <span className="text-zinc-500">Parent npm pkg:</span>{' '}
              <span className="font-mono text-zinc-200">{parentPackage}</span>
            </div>
            <div>
              <span className="text-zinc-500">Reported pkg:</span>{' '}
              <span className="font-mono">{reportedPackage}</span>
            </div>
          </>
        ) : (
          <div className="col-span-2">
            <span className="text-zinc-500">Package:</span>{' '}
            <span className="font-mono text-zinc-200">{reportedPackage}</span>
            {currentVersion ? ` ${currentVersion}` : ''}
          </div>
        )}
        {fixedIn && (
          <div className="col-span-2">
            <span className="text-zinc-500">Fix version{fixedIn.includes(',') ? 's' : ''}:</span>
            <span className="ml-2 px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
              {fixedIn}
            </span>
          </div>
        )}
        {isParentEmbedded && (
          <div className="col-span-2 text-amber-300 italic text-[0.7rem]">
            &#9432; Fix version is for the embedded artifact, not the npm package. Bumping{' '}
            <span className="font-mono">{parentPackage}</span> is the npm-level action.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-700/30">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-cyan-700/40 text-cyan-300 hover:bg-cyan-500/10"
          onClick={onApplyFix}
        >
          Apply fix&hellip;
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-zinc-700 text-zinc-300"
          onClick={onOverridePin}
          title="Force the version via package-manager override (pnpm.overrides / overrides / resolutions)"
        >
          Override pin&hellip;
        </Button>
        <a
          href={patchesHref}
          className="h-7 inline-flex items-center px-3 rounded-md border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Open this project in the Patches view"
        >
          Send to Patches
        </a>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-zinc-400"
          onClick={onViewReferences}
          disabled={refCount === 0}
        >
          View references ({refCount})
        </Button>
      </div>
    </div>
  );
}
