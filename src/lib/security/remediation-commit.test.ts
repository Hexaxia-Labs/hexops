import { describe, it, expect } from 'vitest';
import { remediationFromRow, remediationFromRows } from './remediation-commit';
import type { FindingRow } from './cve-lite-view';

function row(over: Partial<FindingRow> = {}): FindingRow {
  return {
    package: 'qs',
    version: '6.15.1',
    severity: 'medium',
    relationship: 'transitive',
    validatedFixVersion: '6.15.2',
    advisoryIds: ['GHSA-q8mj-m7cp-5q26', 'CVE-2026-8723'],
    ...over,
  };
}

describe('remediationFromRow', () => {
  it('builds one security UpdatedPackage from a row', () => {
    const rc = remediationFromRow(row());
    expect(rc.packages).toEqual([
      { name: 'qs', fromVersion: '6.15.1', toVersion: '6.15.2', isSecurityFix: true, vulnCount: 2 },
    ]);
    expect(rc.advisories).toEqual(['GHSA-q8mj-m7cp-5q26', 'CVE-2026-8723']);
    expect(rc.severity).toBe('medium');
  });

  it('de-dupes advisory ids', () => {
    const rc = remediationFromRow(row({ advisoryIds: ['CVE-1', 'CVE-1', 'GHSA-x'] }));
    expect(rc.advisories).toEqual(['CVE-1', 'GHSA-x']);
    expect(rc.packages[0].vulnCount).toBe(3);
  });

  it('tolerates missing versions', () => {
    const rc = remediationFromRow(row({ version: undefined, validatedFixVersion: undefined }));
    expect(rc.packages[0].fromVersion).toBe('');
    expect(rc.packages[0].toVersion).toBe('');
  });
});

describe('remediationFromRows', () => {
  it('keeps only direct, fixable rows', () => {
    const rows = [
      row({ package: 'a', relationship: 'direct', validatedFixVersion: '2.0.0', advisoryIds: ['CVE-A'], severity: 'high' }),
      row({ package: 'b', relationship: 'transitive', validatedFixVersion: '2.0.0' }),
      row({ package: 'c', relationship: 'direct', validatedFixVersion: undefined }),
    ];
    const rc = remediationFromRows(rows);
    expect(rc.packages.map((p) => p.name)).toEqual(['a']);
  });

  it('unions advisories and takes the max severity', () => {
    const rows = [
      row({ package: 'a', relationship: 'direct', validatedFixVersion: '2.0.0', advisoryIds: ['CVE-A'], severity: 'medium' }),
      row({ package: 'd', relationship: 'direct', validatedFixVersion: '3.0.0', advisoryIds: ['CVE-D', 'CVE-A'], severity: 'critical' }),
    ];
    const rc = remediationFromRows(rows);
    expect(rc.advisories).toEqual(['CVE-A', 'CVE-D']);
    expect(rc.severity).toBe('critical');
  });

  it('returns empty when nothing is fixable', () => {
    const rc = remediationFromRows([row({ relationship: 'transitive' })]);
    expect(rc.packages).toEqual([]);
    expect(rc.advisories).toEqual([]);
    expect(rc.severity).toBeUndefined();
  });
});
