'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface RemediationDialogProps {
  /** Display name of the package the user is about to bump. */
  targetPackage: string;
  /** Current version installed/declared. May be undefined if unknown. */
  currentVersion?: string;
  /** Pre-filled target version. */
  defaultTargetVersion: string;
  /** Number of CVEs covered (informational subtitle). */
  cveCount: number;
  /**
   * 'apply'    — direct bump (defaults viaOverride false)
   * 'override' — write to pnpm.overrides / overrides / resolutions (defaults viaOverride true, checkbox stays user-toggleable)
   */
  mode: 'apply' | 'override';
  /** Optional context shown as a small note (e.g. parent-embedded warning). */
  note?: string;
  onSubmit(payload: { targetVersion: string; viaOverride: boolean }): Promise<void>;
  onCancel(): void;
  busy?: boolean;
}

export function RemediationDialog({
  targetPackage,
  currentVersion,
  defaultTargetVersion,
  cveCount,
  mode,
  note,
  onSubmit,
  onCancel,
  busy,
}: RemediationDialogProps) {
  const [targetVersion, setTargetVersion] = useState(defaultTargetVersion);
  const [viaOverride, setViaOverride] = useState(mode === 'override');

  const handleSubmit = async () => {
    if (!targetVersion.trim()) return;
    await onSubmit({ targetVersion: targetVersion.trim(), viaOverride });
  };

  const title = mode === 'override' ? `Override pin ${targetPackage}` : `Apply fix to ${targetPackage}`;
  const submitLabel = busy
    ? (mode === 'override' ? 'Writing override…' : 'Applying…')
    : (mode === 'override' ? 'Write override' : 'Apply fix');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-500 mt-1">
            {cveCount} CVE{cveCount !== 1 ? 's' : ''}
            {currentVersion ? ` · current ${currentVersion}` : ''}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {note && (
            <div className="text-xs text-amber-300 bg-amber-950/20 border border-amber-700/30 rounded px-2 py-1.5">
              {note}
            </div>
          )}
          <label className="block">
            <div className="text-xs uppercase text-zinc-500 mb-1">Target version</div>
            <input
              type="text"
              value={targetVersion}
              onChange={(e) => setTargetVersion(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-md px-2 py-1.5 font-mono"
              placeholder="e.g. 1.2.3 or latest"
            />
            <p className="text-[0.65rem] text-zinc-500 mt-1">
              Accept any semver string the package manager understands (exact, range, or <code>latest</code>).
            </p>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={viaOverride}
              onChange={(e) => setViaOverride(e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="text-xs text-zinc-200">Apply via package-manager override</div>
              <p className="text-[0.65rem] text-zinc-500 mt-0.5">
                Writes <code>pnpm.overrides</code> / npm <code>overrides</code> / yarn <code>resolutions</code> to force
                the version across the dependency graph. Required when the vulnerable copy is nested inside another
                package.
              </p>
            </div>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-cyan-700/40 text-cyan-300 hover:bg-cyan-500/10"
            onClick={handleSubmit}
            disabled={busy || !targetVersion.trim()}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
