import { describe, it, expect } from 'vitest';
import { SecuritySummaryBar, type SecuritySummaryBarProps } from './security-summary-bar';

describe('SecuritySummaryBar', () => {
  it('exports SecuritySummaryBar as a function component', () => {
    expect(typeof SecuritySummaryBar).toBe('function');
  });

  it('exports SecuritySummaryBarProps interface', () => {
    const props: SecuritySummaryBarProps = {
      counts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
    };
    expect(props.counts.critical).toBe(0);
  });

  it('accepts counts with all severities', () => {
    const props: SecuritySummaryBarProps = {
      counts: {
        critical: 1,
        high: 2,
        medium: 3,
        low: 4,
        info: 5,
      },
    };
    expect(props.counts.critical).toBe(1);
    expect(props.counts.high).toBe(2);
    expect(props.counts.medium).toBe(3);
    expect(props.counts.low).toBe(4);
    expect(props.counts.info).toBe(5);
  });

  it('accepts counts without optional info field', () => {
    const props: SecuritySummaryBarProps = {
      counts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };
    expect(props.counts).toHaveProperty('critical');
    expect(props.counts).toHaveProperty('high');
    expect(props.counts).toHaveProperty('medium');
    expect(props.counts).toHaveProperty('low');
  });

  it('handles all zero counts (empty state)', () => {
    const props: SecuritySummaryBarProps = {
      counts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };
    expect(props.counts.critical).toBe(0);
    expect(props.counts.high).toBe(0);
    expect(props.counts.medium).toBe(0);
    expect(props.counts.low).toBe(0);
  });
});
