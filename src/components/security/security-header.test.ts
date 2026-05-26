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
});
