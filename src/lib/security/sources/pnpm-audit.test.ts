import { describe, it, expect } from 'vitest';
import { vulnInfoToFinding } from './pnpm-audit';

describe('vulnInfoToFinding', () => {
  it('npm case: extracts GHSA from url and includes numeric advisoryId', () => {
    const v = {
      name: 'postcss',
      currentVersion: '8.5.15',
      severity: 'moderate' as const,
      title: 'PostCSS line return parsing error',
      advisoryId: 1117015,
      url: 'https://github.com/advisories/GHSA-qx2v-qp2m-jg93',
      fixVersion: '8.5.10',
      path: 'node_modules/postcss',
      fixAvailable: true,
      isDirect: true,
    };

    const finding = vulnInfoToFinding(v);

    expect(finding.type).toBe('vulnerability');
    expect(finding.sources).toEqual(['pnpm-audit']);
    expect(finding.severity).toBe('medium');
    expect(finding.fixedIn).toBe('8.5.10');
    expect(finding.advisoryIds).toContain('GHSA-qx2v-qp2m-jg93');
    expect(finding.advisoryIds).toContain('1117015');
  });

  it('pnpm case with cves: includes CVEs, GHSA from url, and numeric advisoryId', () => {
    const v = {
      name: 'x',
      currentVersion: '1.0.0',
      severity: 'high' as const,
      title: 't',
      cves: ['CVE-2024-1'],
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      advisoryId: 42,
      path: 'node_modules/x',
      fixAvailable: true,
      isDirect: true,
    };

    const finding = vulnInfoToFinding(v);

    expect(finding.advisoryIds).toContain('CVE-2024-1');
    expect(finding.advisoryIds).toContain('GHSA-aaaa-bbbb-cccc');
    expect(finding.advisoryIds).toContain('42');
  });

  it('no-url case: does not crash and returns only numeric advisoryId', () => {
    const v = {
      name: 'y',
      currentVersion: '2.0.0',
      severity: 'low' as const,
      title: 't',
      advisoryId: 7,
      path: 'node_modules/y',
      fixAvailable: false,
      isDirect: true,
    };

    const finding = vulnInfoToFinding(v);

    expect(finding.advisoryIds).toEqual(['7']);
  });

  it('dedup: does not include GHSA twice if it already appears in cves', () => {
    const v = {
      name: 'z',
      currentVersion: '3.0.0',
      severity: 'high' as const,
      title: 't',
      cves: ['GHSA-qx2v-qp2m-jg93'],
      url: 'https://github.com/advisories/GHSA-qx2v-qp2m-jg93',
      advisoryId: 99,
      path: 'node_modules/z',
      fixAvailable: true,
      isDirect: true,
    };

    const finding = vulnInfoToFinding(v);

    const ghsaEntries = finding.advisoryIds.filter(id => id === 'GHSA-qx2v-qp2m-jg93');
    expect(ghsaEntries.length).toBe(1);
  });
});
