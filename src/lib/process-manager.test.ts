import { describe, it, expect } from 'vitest';
import { withoutInheritedBundlerEnv } from './process-manager';

describe('withoutInheritedBundlerEnv (#111)', () => {
  it('strips TURBOPACK so hexops\'s own bundler env does not leak into --webpack child projects', () => {
    const result = withoutInheritedBundlerEnv({ TURBOPACK: '1', PATH: '/usr/bin', FOO: 'bar' });
    expect(result.TURBOPACK).toBeUndefined();
    expect(result.PATH).toBe('/usr/bin');
    expect(result.FOO).toBe('bar');
  });

  it('does not mutate the input env', () => {
    const input = { TURBOPACK: '1', FOO: 'bar' };
    withoutInheritedBundlerEnv(input);
    expect(input.TURBOPACK).toBe('1');
  });

  it('is a no-op when TURBOPACK is absent', () => {
    expect(withoutInheritedBundlerEnv({ FOO: 'bar' })).toEqual({ FOO: 'bar' });
  });
});
