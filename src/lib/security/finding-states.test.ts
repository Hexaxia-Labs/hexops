import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyScan,
  getFindingStates,
  firstSeenIndex,
  _setFindingStatesDirForTest,
} from './finding-states';
import type { Finding } from './types';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'hexops-finding-states-'));
  _setFindingStatesDirForTest(tempDir);
});

afterEach(() => {
  _setFindingStatesDirForTest(undefined);
  rmSync(tempDir, { recursive: true, force: true });
});

const PROJECT = 'test-proj';

function makeFinding(dedupKey: string, severity: Finding['severity'] = 'high'): Finding {
  return {
    type: 'vulnerability',
    dedupKey,
    sources: ['pnpm-audit'],
    title: `Finding ${dedupKey}`,
    detail: '',
    severity,
    advisoryIds: [`GHSA-${dedupKey}`],
    rawBySource: {},
    references: [],
  };
}

describe('applyScan', () => {
  it('empty prev state + finding → newlyDetected', () => {
    const f = makeFinding('CVE-2026-0001');
    const now = new Date('2026-01-01T10:00:00.000Z');
    const diff = applyScan(PROJECT, [f], now);

    expect(diff.newlyDetected).toEqual(['CVE-2026-0001']);
    expect(diff.redetected).toHaveLength(0);
    expect(diff.resolved).toHaveLength(0);
    expect(diff.stillOpen).toHaveLength(0);

    const states = getFindingStates(PROJECT);
    expect(states['CVE-2026-0001'].status).toBe('open');
    expect(states['CVE-2026-0001'].firstSeenAt).toBe('2026-01-01T10:00:00.000Z');
    expect(states['CVE-2026-0001'].lastSeenAt).toBe('2026-01-01T10:00:00.000Z');
    expect(states['CVE-2026-0001'].severity).toBe('high');
  });

  it('same finding twice → second call yields stillOpen, lastSeenAt updates', () => {
    const f = makeFinding('CVE-2026-0001');
    const first = new Date('2026-01-01T10:00:00.000Z');
    const second = new Date('2026-01-02T10:00:00.000Z');

    applyScan(PROJECT, [f], first);
    const diff = applyScan(PROJECT, [f], second);

    expect(diff.newlyDetected).toHaveLength(0);
    expect(diff.stillOpen).toEqual(['CVE-2026-0001']);
    expect(diff.redetected).toHaveLength(0);
    expect(diff.resolved).toHaveLength(0);

    const states = getFindingStates(PROJECT);
    // firstSeenAt stays at original, lastSeenAt moves to second scan
    expect(states['CVE-2026-0001'].firstSeenAt).toBe('2026-01-01T10:00:00.000Z');
    expect(states['CVE-2026-0001'].lastSeenAt).toBe('2026-01-02T10:00:00.000Z');
  });

  it('finding disappears → resolved, status flips, lastSeenAt frozen', () => {
    const f = makeFinding('CVE-2026-0002');
    const t1 = new Date('2026-01-01T10:00:00.000Z');
    const t2 = new Date('2026-01-02T10:00:00.000Z');

    applyScan(PROJECT, [f], t1);
    // Second scan: finding is gone
    const diff = applyScan(PROJECT, [], t2);

    expect(diff.resolved).toEqual(['CVE-2026-0002']);
    expect(diff.newlyDetected).toHaveLength(0);
    expect(diff.stillOpen).toHaveLength(0);

    const states = getFindingStates(PROJECT);
    expect(states['CVE-2026-0002'].status).toBe('resolved');
    // lastSeenAt frozen at t1 (when it was last confirmed present)
    expect(states['CVE-2026-0002'].lastSeenAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('resolved finding reappears → redetected, status back to open', () => {
    const f = makeFinding('CVE-2026-0003');
    const t1 = new Date('2026-01-01T10:00:00.000Z');
    const t2 = new Date('2026-01-02T10:00:00.000Z');
    const t3 = new Date('2026-01-03T10:00:00.000Z');

    // Appear → disappear → reappear
    applyScan(PROJECT, [f], t1);
    applyScan(PROJECT, [], t2);

    const states1 = getFindingStates(PROJECT);
    expect(states1['CVE-2026-0003'].status).toBe('resolved');

    const diff = applyScan(PROJECT, [f], t3);

    expect(diff.redetected).toEqual(['CVE-2026-0003']);
    expect(diff.newlyDetected).toHaveLength(0);
    expect(diff.stillOpen).toHaveLength(0);

    const states2 = getFindingStates(PROJECT);
    expect(states2['CVE-2026-0003'].status).toBe('open');
    // firstSeenAt preserved from original detection
    expect(states2['CVE-2026-0003'].firstSeenAt).toBe('2026-01-01T10:00:00.000Z');
    expect(states2['CVE-2026-0003'].lastSeenAt).toBe('2026-01-03T10:00:00.000Z');
  });

  it('firstSeenIndex returns a dedupKey → firstSeenAt mapping', () => {
    const f = makeFinding('CVE-2026-0004');
    const t = new Date('2026-03-15T08:00:00.000Z');
    applyScan(PROJECT, [f], t);
    const idx = firstSeenIndex(PROJECT);
    expect(idx['CVE-2026-0004']).toBe('2026-03-15T08:00:00.000Z');
  });
});
