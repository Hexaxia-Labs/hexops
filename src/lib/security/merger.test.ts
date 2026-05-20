import { describe, it, expect } from 'vitest';
import { computeDedupKey, mergeFindings } from './merger';
import type { Finding } from './types';

function f(overrides: Partial<Finding>): Finding {
  return {
    type: 'vulnerability',
    dedupKey: '',
    sources: [],
    title: 'X',
    detail: '',
    severity: 'low',
    advisoryIds: [],
    rawBySource: {},
    references: [],
    ...overrides,
  };
}

describe('computeDedupKey', () => {
  it('vulnerability: prefers GHSA when present', () => {
    expect(computeDedupKey(f({ advisoryIds: ['GHSA-aaaa-bbbb-cccc', 'CVE-2024-1'] })))
      .toBe('vuln:GHSA-aaaa-bbbb-cccc');
  });

  it('vulnerability: falls back to CVE when no GHSA', () => {
    expect(computeDedupKey(f({ advisoryIds: ['CVE-2024-1'] })))
      .toBe('vuln:CVE-2024-1');
  });

  it('vulnerability: falls back to pkg@ver|title with no advisory ids', () => {
    expect(computeDedupKey(f({ advisoryIds: [], package: 'lodash', version: '4.17.0', title: 'prototype pollution' })))
      .toBe('vuln:lodash@4.17.0|prototype pollution');
  });

  it('integrity: keys on pkg@ver|subtype embedded in title', () => {
    expect(computeDedupKey(f({ type: 'integrity', package: 'lodash-utils', version: '1.0.0', title: 'typosquat-suspect' })))
      .toBe('integ:lodash-utils@1.0.0|typosquat-suspect');
  });

  it('secret: keys on path|fingerprint embedded in detail', () => {
    expect(computeDedupKey(f({ type: 'secret', path: 'src/.env', detail: 'fp:abc123' })))
      .toBe('secret:src/.env|abc123');
  });

  it('license: keys on pkg@ver|licenseId', () => {
    expect(computeDedupKey(f({ type: 'license', package: 'foo', version: '1.0.0', title: 'GPL-3.0' })))
      .toBe('lic:foo@1.0.0|GPL-3.0');
  });

  it('config: keys on path|ruleId', () => {
    expect(computeDedupKey(f({ type: 'config', path: 'tsconfig.json', title: 'no-strict' })))
      .toBe('config:tsconfig.json|no-strict');
  });
});

describe('mergeFindings', () => {
  it('returns a single finding tagged with both sources when keys match', () => {
    const a: Finding = f({ advisoryIds: ['GHSA-x'], package: 'next', version: '16.0.0', severity: 'high', sources: ['pnpm-audit'], rawBySource: { 'pnpm-audit': { hello: 1 } } });
    const b: Finding = f({ advisoryIds: ['GHSA-x'], package: 'next', version: '16.0.0', severity: 'critical', sources: ['grype'], rawBySource: { grype: { hello: 2 } } });
    const merged = mergeFindings(new Map([['pnpm-audit', [a]], ['grype', [b]]]));
    expect(merged).toHaveLength(1);
    expect(merged[0].sources.sort()).toEqual(['grype', 'pnpm-audit']);
    expect(merged[0].rawBySource).toEqual({ 'pnpm-audit': { hello: 1 }, grype: { hello: 2 } });
  });

  it('takes the highest severity across sources', () => {
    const a = f({ advisoryIds: ['GHSA-y'], severity: 'low' });
    const b = f({ advisoryIds: ['GHSA-y'], severity: 'critical' });
    const [m] = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(m.severity).toBe('critical');
  });

  it('flags divergence when severity differs by more than one level', () => {
    const a = f({ advisoryIds: ['GHSA-z'], severity: 'low' });
    const b = f({ advisoryIds: ['GHSA-z'], severity: 'critical' });
    const [m] = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(m.divergent).toBe(true);
  });

  it('does not flag divergence when severity differs by one level', () => {
    const a = f({ advisoryIds: ['GHSA-z2'], severity: 'medium' });
    const b = f({ advisoryIds: ['GHSA-z2'], severity: 'high' });
    const [m] = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(m.divergent).toBeFalsy();
  });

  it('takes max cvss when present', () => {
    const a = f({ advisoryIds: ['GHSA-c'], cvss: 4.5 });
    const b = f({ advisoryIds: ['GHSA-c'], cvss: 9.8 });
    const [m] = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(m.cvss).toBe(9.8);
  });

  it('preserves source-only findings, tagged with the lone source', () => {
    const a = f({ advisoryIds: ['GHSA-only-in-grype'], sources: ['grype'] });
    const merged = mergeFindings(new Map([['pnpm-audit', []], ['grype', [a]]]));
    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toEqual(['grype']);
  });

  it('unions advisoryIds across sources', () => {
    const a = f({ advisoryIds: ['GHSA-aliased', 'CVE-2024-9'] });
    const b = f({ advisoryIds: ['GHSA-aliased', 'CVE-2024-10'] });
    const [m] = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(m.advisoryIds.sort()).toEqual(['CVE-2024-10', 'CVE-2024-9', 'GHSA-aliased']);
  });

  it('unions references across sources', () => {
    const a = f({ advisoryIds: ['GHSA-r'], references: ['https://a'] });
    const b = f({ advisoryIds: ['GHSA-r'], references: ['https://b'] });
    const [m] = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(m.references.sort()).toEqual(['https://a', 'https://b']);
  });

  it('merges findings that share any advisory id even when canonical keys differ (postcss #80 case)', () => {
    const pnpm = f({ package: 'postcss', version: '8.4.31', severity: 'medium', advisoryIds: ['CVE-2026-41305', '1117015'], sources: ['pnpm-audit'] });
    const grype = f({ package: 'postcss', version: '8.4.31', severity: 'medium', advisoryIds: ['GHSA-qx2v-qp2m-jg93', 'CVE-2026-41305'], sources: ['grype'] });
    const merged = mergeFindings(new Map([['pnpm-audit', [pnpm]], ['grype', [grype]]]));
    expect(merged).toHaveLength(1);
    expect(merged[0].sources.sort()).toEqual(['grype', 'pnpm-audit']);
    expect(merged[0].advisoryIds.sort()).toEqual(['1117015', 'CVE-2026-41305', 'GHSA-qx2v-qp2m-jg93']);
  });

  it('keeps distinct vulnerabilities separate when they share no advisory id', () => {
    const a = f({ package: 'x', advisoryIds: ['CVE-1'], sources: ['s1'] });
    const b = f({ package: 'y', advisoryIds: ['CVE-2'], sources: ['s2'] });
    const merged = mergeFindings(new Map([['s1', [a]], ['s2', [b]]]));
    expect(merged).toHaveLength(2);
  });
});
