import type { Severity } from '@/lib/security/types';

const STYLES: Record<Severity, string> = {
  critical: 'bg-red-900/40 text-red-200 border-red-700',
  high: 'bg-orange-900/40 text-orange-200 border-orange-700',
  medium: 'bg-yellow-900/30 text-yellow-200 border-yellow-700',
  low: 'bg-blue-900/30 text-blue-200 border-blue-700',
  info: 'bg-zinc-800 text-zinc-300 border-zinc-700',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium uppercase rounded border ${STYLES[severity]}`}>
      {severity}
    </span>
  );
}
