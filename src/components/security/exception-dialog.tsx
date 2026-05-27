'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const CLASSIFICATIONS: Array<{ value: string; label: string; description: string }> = [
  { value: 'risk-accepted',        label: 'Risk accepted',        description: 'We acknowledge it and choose not to fix' },
  { value: 'false-positive',       label: 'False positive',       description: 'Scanner is wrong' },
  { value: 'compensating-control', label: 'Compensating control', description: 'Mitigated by other means' },
  { value: 'deferred',             label: 'Deferred',             description: 'Will fix later, not now' },
  { value: 'unfixable',            label: 'Unfixable',            description: 'No upstream fix exists' },
  { value: 'deviation',            label: 'Deviation',            description: 'Documented departure from standard practice' },
];

export interface ExceptionDialogProps {
  parentPackage: string;
  findingsCount?: number;            // only shown in file mode (omit in edit)
  existing?: {
    classification: string;
    reason: string;
    notes?: string;
    expiresAt?: string;
  };                                  // when present, dialog is in edit mode
  onSubmit(payload: { classification: string; reason: string; expiresAt?: string; notes?: string }): Promise<void>;
  onCancel(): void;
  busy?: boolean;
}

export function ExceptionDialog({
  parentPackage,
  findingsCount,
  existing,
  onSubmit,
  onCancel,
  busy,
}: ExceptionDialogProps) {
  const [classification, setClassification] = useState(existing?.classification ?? 'risk-accepted');
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [expiresInDays, setExpiresInDays] = useState<string>(() => {
    if (!existing?.expiresAt) return existing ? '0' : '90';
    const ms = new Date(existing.expiresAt).getTime() - Date.now();
    return Math.max(0, Math.round(ms / 86400000)).toString();
  });

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    let expiresAt: string | undefined;
    const days = parseInt(expiresInDays, 10);
    if (!isNaN(days) && days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiresAt = d.toISOString();
    }
    await onSubmit({
      classification,
      reason: reason.trim(),
      expiresAt,
      notes: notes.trim() || undefined,
    });
  };

  const title = existing
    ? `Edit exception for ${parentPackage}`
    : `File exception for ${parentPackage}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
          {!existing && findingsCount !== undefined && (
            <p className="text-xs text-zinc-500 mt-1">
              {findingsCount} finding{findingsCount !== 1 ? 's' : ''} covered
            </p>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <div className="text-xs uppercase text-zinc-500 mb-1">Classification</div>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-md px-2 py-1.5"
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} — {c.description}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-xs uppercase text-zinc-500 mb-1">Reason (required)</div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-md px-2 py-1.5 font-sans min-h-[60px]"
              placeholder="Why is this exception justified?"
            />
          </label>
          <label className="block">
            <div className="text-xs uppercase text-zinc-500 mb-1">Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-md px-2 py-1.5 font-sans min-h-[40px]"
            />
          </label>
          <label className="block">
            <div className="text-xs uppercase text-zinc-500 mb-1">Expires (optional)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="w-20 bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-md px-2 py-1.5"
              />
              <span className="text-xs text-zinc-500">days from now (&apos;0&apos; for no expiry)</span>
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
            className="border-zinc-700"
            onClick={handleSubmit}
            disabled={busy || !reason.trim()}
          >
            {existing ? (busy ? 'Saving…' : 'Save changes') : (busy ? 'Filing…' : 'File exception')}
          </Button>
        </div>
      </div>
    </div>
  );
}
