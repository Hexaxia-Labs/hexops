import { describe, it, expect } from 'vitest';
import { rewriteCommandForSafeChain } from './rewrite';

describe('rewriteCommandForSafeChain', () => {
  it('rewrites pnpm to aikido-pnpm', () => {
    expect(rewriteCommandForSafeChain(['pnpm', 'install'])).toEqual(['aikido-pnpm', 'install']);
  });

  it('rewrites npm to aikido-npm', () => {
    expect(rewriteCommandForSafeChain(['npm', 'install', '--frozen-lockfile'])).toEqual(['aikido-npm', 'install', '--frozen-lockfile']);
  });

  it('rewrites yarn to aikido-yarn', () => {
    expect(rewriteCommandForSafeChain(['yarn', 'install'])).toEqual(['aikido-yarn', 'install']);
  });

  it('preserves trailing args verbatim', () => {
    expect(rewriteCommandForSafeChain(['pnpm', 'install', '--prefer-offline', '--no-frozen-lockfile'])).toEqual(
      ['aikido-pnpm', 'install', '--prefer-offline', '--no-frozen-lockfile']
    );
  });

  it('returns input unchanged when the head is not a known package manager', () => {
    expect(rewriteCommandForSafeChain(['echo', 'hi'])).toEqual(['echo', 'hi']);
  });

  it('returns input unchanged for empty arrays', () => {
    expect(rewriteCommandForSafeChain([])).toEqual([]);
  });

  it('handles absolute paths to the package manager binary', () => {
    expect(rewriteCommandForSafeChain(['/usr/bin/pnpm', 'install'])).toEqual(['aikido-pnpm', 'install']);
    expect(rewriteCommandForSafeChain(['/usr/local/bin/npm', 'ci'])).toEqual(['aikido-npm', 'ci']);
  });
});
