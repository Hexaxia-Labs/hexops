import { describe, it, expect } from 'vitest';
import { deriveRailState, type FleetProject } from './fleet-project-rail';

const base: FleetProject = { id: 'p', name: 'p', critical: 0, high: 0, medium: 0, low: 0, scannedAt: null };

describe('deriveRailState', () => {
  it('returns not-scanned when scannedAt is null', () => {
    expect(deriveRailState({ ...base, scannedAt: null })).toBe('not-scanned');
  });

  it('returns clean when scannedAt is set and all counts are zero', () => {
    expect(deriveRailState({ ...base, scannedAt: '2026-05-21T00:00:00Z' })).toBe('clean');
  });

  it('returns has-findings when critical > 0', () => {
    expect(deriveRailState({ ...base, scannedAt: '2026-05-21T00:00:00Z', critical: 2 })).toBe('has-findings');
  });

  it('returns has-findings when only low > 0', () => {
    expect(deriveRailState({ ...base, scannedAt: '2026-05-21T00:00:00Z', low: 1 })).toBe('has-findings');
  });

  it('returns not-scanned even when counts are non-zero (scannedAt takes priority)', () => {
    expect(deriveRailState({ ...base, scannedAt: null, critical: 5 })).toBe('not-scanned');
  });
});
