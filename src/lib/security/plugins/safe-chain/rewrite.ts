import { basename } from 'node:path';

const PM_TO_WRAPPER: Record<string, string> = {
  pnpm: 'aikido-pnpm',
  npm: 'aikido-npm',
  yarn: 'aikido-yarn',
};

/**
 * Returns a copy of `command` with the head replaced by the Safe Chain
 * wrapper when the head is a known package manager (matched by basename so
 * absolute paths work). Otherwise returns the input unchanged.
 *
 * Pure function — no IO.
 */
export function rewriteCommandForSafeChain(command: ReadonlyArray<string>): string[] {
  if (command.length === 0) return [...command];
  const head = command[0];
  const wrapper = PM_TO_WRAPPER[basename(head)];
  if (!wrapper) return [...command];
  return [wrapper, ...command.slice(1)];
}
