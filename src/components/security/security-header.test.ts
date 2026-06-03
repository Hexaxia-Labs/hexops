import { describe, it, expect } from 'vitest';
import { SecurityHeader, type SecurityHeaderProps, type ScanSourceId, type ScanMeter, type OsvDbStatus } from './security-header';

describe('SecurityHeader', () => {
  it('exports SecurityHeader as a function component', () => {
    expect(typeof SecurityHeader).toBe('function');
  });

  it('accepts all required props', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 3,
      sourcesCount: 2,
      lastScan: '2026-05-26T15:00:00Z',
      scanning: false,
      onScan: () => {},
    };
    expect(props.findingsCount).toBe(3);
    expect(props.sourcesCount).toBe(2);
    expect(props.lastScan).toBe('2026-05-26T15:00:00Z');
    expect(props.scanning).toBe(false);
  });

  it('handles undefined lastScan prop', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      onScan: () => {},
    };
    expect(props.lastScan).toBeUndefined();
  });

  it('handles scanning state', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 1,
      sourcesCount: 1,
      lastScan: undefined,
      scanning: true,
      onScan: () => {},
    };
    expect(props.scanning).toBe(true);
  });

  it('accepts optional projectCount prop for empty-state copy', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      projectCount: 12,
      onScan: () => {},
    };
    expect(props.projectCount).toBe(12);
    expect(props.findingsCount).toBe(0);
    expect(props.lastScan).toBeUndefined();
  });

  it('accepts meters prop with per-source ScanMeter values', () => {
    const meter: ScanMeter = { done: 5, total: 31, active: 2 };
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: true,
      meters: {
        'pnpm-audit': meter,
        'grype': { done: 0, total: 31, active: 3 },
      },
      onScan: () => {},
    };
    expect(props.meters?.['pnpm-audit']?.done).toBe(5);
    expect(props.meters?.['pnpm-audit']?.total).toBe(31);
    expect(props.meters?.['pnpm-audit']?.active).toBe(2);
    expect(props.meters?.['grype']?.done).toBe(0);
    expect(props.meters?.['cve-lite']).toBeUndefined();
  });

  it('accepts partial meters (single-source scan)', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: true,
      meters: {
        'cve-lite': { done: 10, total: 20, active: 1 },
      },
      onScan: () => {},
    };
    expect(props.meters?.['cve-lite']?.done).toBe(10);
    expect(props.meters?.['pnpm-audit']).toBeUndefined();
    expect(props.meters?.['grype']).toBeUndefined();
  });

  it('accepts osv prop with lastSync timestamp', () => {
    const osv: OsvDbStatus = { lastSync: '2026-05-27T00:00:00Z' };
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      osv,
      onScan: () => {},
    };
    expect(props.osv?.lastSync).toBe('2026-05-27T00:00:00Z');
  });

  it('accepts osv prop with undefined lastSync (never synced)', () => {
    const osv: OsvDbStatus = {};
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      osv,
      onScan: () => {},
    };
    expect(props.osv?.lastSync).toBeUndefined();
  });

  it('accepts syncingOsv and onSyncOsv props', () => {
    const onSyncOsv = () => {};
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      syncingOsv: true,
      onSyncOsv,
      onScan: () => {},
    };
    expect(props.syncingOsv).toBe(true);
    expect(props.onSyncOsv).toBe(onSyncOsv);
  });

  it('ScanSourceId type covers all three sources', () => {
    const sources: ScanSourceId[] = ['pnpm-audit', 'grype', 'cve-lite'];
    expect(sources).toHaveLength(3);
  });

  it('onScan accepts both all and specific sources', () => {
    let called: ScanSourceId[] | 'all' | null = null;
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      onScan: (sources) => { called = sources; },
    };
    props.onScan('all');
    expect(called).toBe('all');

    props.onScan(['grype']);
    expect(called).toEqual(['grype']);

    props.onScan(['pnpm-audit', 'cve-lite']);
    expect(called).toEqual(['pnpm-audit', 'cve-lite']);
  });
});
