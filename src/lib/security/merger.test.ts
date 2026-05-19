import { describe, it, expect } from 'vitest';
import { computeDedupKey } from './merger';
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
