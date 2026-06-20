import { describe, it, expect } from 'vitest';
import { parseOutdatedData } from './patch-scanner';

describe('parseOutdatedData', () => {
  it('reads pnpm object format and honors dependencyType (dev vs prod)', () => {
    // `pnpm outdated --format json` returns an OBJECT keyed by name, using
    // `dependencyType` (not npm's `type`). A dev dep must not be mislabeled prod.
    const data = {
      tailwindcss: { current: '3.4.19', wanted: '3.4.19', latest: '4.3.1', dependencyType: 'devDependencies' },
    };
    const result = parseOutdatedData(data);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'tailwindcss',
      current: '3.4.19',
      latest: '4.3.1',
      type: 'devDependencies',
    });
  });

  it('reads npm object format with type', () => {
    const data = {
      lodash: { current: '4.17.20', wanted: '4.17.21', latest: '4.17.21', type: 'dependencies' },
    };
    expect(parseOutdatedData(data)[0]).toMatchObject({ name: 'lodash', type: 'dependencies' });
  });

  it('handles npm workspace array entries (one per workspace)', () => {
    const data = {
      react: [{ current: '18.0.0', wanted: '18.2.0', latest: '18.2.0', type: 'dependencies' }],
    };
    expect(parseOutdatedData(data)[0]).toMatchObject({ name: 'react', latest: '18.2.0' });
  });

  it('filters out packages whose current already equals latest', () => {
    const data = { foo: { current: '1.0.0', wanted: '1.0.0', latest: '1.0.0', type: 'dependencies' } };
    expect(parseOutdatedData(data)).toHaveLength(0);
  });
});
