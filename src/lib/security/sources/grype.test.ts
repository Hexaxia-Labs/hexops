import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGrypeJson } from './grype';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/grype-sample.json'), 'utf-8'));

describe('parseGrypeJson', () => {
  it('returns at least one finding for the fixture', () => {
    const findings = parseGrypeJson(fixture);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('maps Grype severities into our enum', () => {
    const findings = parseGrypeJson(fixture);
    for (const f of findings) {
      expect(['critical', 'high', 'medium', 'low', 'info']).toContain(f.severity);
    }
  });

  it('every finding has type vulnerability + a non-empty advisoryIds', () => {
    const findings = parseGrypeJson(fixture);
    for (const f of findings) {
      expect(f.type).toBe('vulnerability');
      expect(f.advisoryIds.length).toBeGreaterThan(0);
    }
  });

  it('tags sources with [grype]', () => {
    const findings = parseGrypeJson(fixture);
    for (const f of findings) expect(f.sources).toEqual(['grype']);
  });
});
