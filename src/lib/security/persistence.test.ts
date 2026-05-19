import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readSecurityCache, writeSecurityCache, _setCacheDirForTest } from './persistence';
import type { ScanResult } from './types';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hexops-security-cache-'));
  _setCacheDirForTest(dir);
  return () => rmSync(dir, { recursive: true, force: true });
});

function sample(projectId: string): ScanResult {
  return {
    cacheVersion: 1,
    projectId,
    timestamp: new Date().toISOString(),
    durationMs: 100,
    sources: {},
    findings: [],
  };
}

describe('security cache', () => {
  it('returns null when no cache exists', () => {
    expect(readSecurityCache('p1')).toBeNull();
  });

  it('round-trips a write/read', () => {
    const r = sample('p1');
    writeSecurityCache('p1', r);
    expect(readSecurityCache('p1')).toEqual(r);
  });

  it('writes are atomic — no .tmp file lingers', () => {
    writeSecurityCache('p1', sample('p1'));
    const files = readdirSync(dir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });

  it('treats malformed JSON as no cache', () => {
    writeFileSync(join(dir, 'security-p1.json'), 'this is not json');
    expect(readSecurityCache('p1')).toBeNull();
  });

  it('treats wrong cacheVersion as no cache', () => {
    writeFileSync(join(dir, 'security-p1.json'), JSON.stringify({ ...sample('p1'), cacheVersion: 99 }));
    expect(readSecurityCache('p1')).toBeNull();
  });
});
