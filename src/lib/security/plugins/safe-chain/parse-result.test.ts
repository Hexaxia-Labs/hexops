import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSafeChainResult } from './parse-result';

const blocked = readFileSync(join(__dirname, '__fixtures__/safe-chain-block.stderr.txt'), 'utf8');
const clean = readFileSync(join(__dirname, '__fixtures__/safe-chain-clean.stderr.txt'), 'utf8');

describe('parseSafeChainResult', () => {
  it('exit 0 → blocked:false regardless of stderr', () => {
    expect(parseSafeChainResult({ code: 0, stdout: '', stderr: '' })).toEqual({ blocked: false });
    expect(parseSafeChainResult({ code: 0, stdout: '', stderr: clean })).toEqual({ blocked: false });
  });

  it('non-zero exit + BLOCKED marker → blocked:true with parsed refs', () => {
    const out = parseSafeChainResult({ code: 1, stdout: '', stderr: blocked });
    expect(out.blocked).toBe(true);
    expect(out.message).toMatch(/Refusing to install/);
    expect(out.advisoryRefs).toEqual(['MAL-2026-0123', 'MAL-2026-0456']);
  });

  it('non-zero exit without BLOCKED marker → blocked:false (treat as install failure to bubble up)', () => {
    const out = parseSafeChainResult({ code: 1, stdout: '', stderr: 'ENOSPC: no space left on device' });
    expect(out.blocked).toBe(false);
  });

  it('handles unicode and multi-line messages without throwing', () => {
    expect(() => parseSafeChainResult({ code: 1, stdout: '', stderr: '✗\nbleh\n' })).not.toThrow();
  });
});
