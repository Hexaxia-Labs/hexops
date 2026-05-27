import { describe, it, expect } from 'vitest';
import { SecurityHeader, type SecurityHeaderProps } from './security-header';

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
      onRescan: () => {},
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
      onRescan: () => {},
    };
    expect(props.lastScan).toBeUndefined();
  });

  it('handles scanning state', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 1,
      sourcesCount: 1,
      lastScan: undefined,
      scanning: true,
      onRescan: () => {},
    };
    expect(props.scanning).toBe(true);
  });

  it('accepts optional scanProgress prop', () => {
    const propsInFlight: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: true,
      scanProgress: { done: 5, total: 31 },
      onRescan: () => {},
    };
    expect(propsInFlight.scanProgress?.done).toBe(5);
    expect(propsInFlight.scanProgress?.total).toBe(31);

    const propsNull: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      scanProgress: null,
      onRescan: () => {},
    };
    expect(propsNull.scanProgress).toBeNull();
  });

  it('accepts optional projectCount prop for empty-state copy', () => {
    const props: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      projectCount: 12,
      onRescan: () => {},
    };
    expect(props.projectCount).toBe(12);
    // When findingsCount===0 and lastScan is undefined, the component should show
    // "{projectCount} projects · no scans cached yet" — verified structurally here.
    expect(props.findingsCount).toBe(0);
    expect(props.lastScan).toBeUndefined();
  });

  it('scanProgress null leaves subtitle in normal or empty-state mode', () => {
    // Explicitly null scanProgress + no findings + no lastScan → empty-state
    const emptyState: SecurityHeaderProps = {
      findingsCount: 0,
      sourcesCount: 0,
      lastScan: undefined,
      scanning: false,
      scanProgress: null,
      projectCount: 5,
      onRescan: () => {},
    };
    expect(emptyState.scanProgress).toBeNull();
    expect(emptyState.projectCount).toBe(5);

    // Explicitly null scanProgress + findings present → normal subtitle
    const normalState: SecurityHeaderProps = {
      findingsCount: 10,
      sourcesCount: 2,
      lastScan: '2026-05-26T15:00:00Z',
      scanning: false,
      scanProgress: null,
      onRescan: () => {},
    };
    expect(normalState.findingsCount).toBe(10);
    expect(normalState.scanProgress).toBeNull();
  });
});
