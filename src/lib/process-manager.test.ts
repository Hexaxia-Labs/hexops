import { describe, it, expect, vi } from 'vitest';
import {
  withoutInheritedBundlerEnv,
  decideDevServerGuard,
  isHexopsSelf,
  runWithDevServerGuard,
  type DevServerGuardDeps,
} from './process-manager';
import type { ProjectConfig } from './types';

function makeProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id: 'proj',
    name: 'Proj',
    path: '/tmp/some-other-project',
    port: 3001,
    category: 'app',
    scripts: { dev: 'next dev', build: 'next build' },
    ...overrides,
  };
}

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

describe('decideDevServerGuard (#109)', () => {
  it('blocks when patching hexops itself, even if also tracked', () => {
    // You cannot stop->apply->restart the server that is serving the request.
    expect(decideDevServerGuard({ isSelf: true, isTracked: true }).action).toBe('block-self');
    expect(decideDevServerGuard({ isSelf: true, isTracked: false }).action).toBe('block-self');
  });

  it('orchestrates when a tracked managed project is running', () => {
    expect(decideDevServerGuard({ isSelf: false, isTracked: true }).action).toBe('orchestrate');
  });

  it('passes through when nothing is running', () => {
    expect(decideDevServerGuard({ isSelf: false, isTracked: false }).action).toBe('passthrough');
  });
});

describe('isHexopsSelf (#109)', () => {
  it('is true when the project path is hexops own cwd', () => {
    expect(isHexopsSelf(makeProject({ path: process.cwd() }))).toBe(true);
  });

  it('is false for a different project path', () => {
    expect(isHexopsSelf(makeProject({ path: '/tmp/definitely-not-hexops' }))).toBe(false);
  });
});

describe('runWithDevServerGuard (#109)', () => {
  function makeDeps(overrides: Partial<DevServerGuardDeps> = {}): DevServerGuardDeps {
    return {
      isSelf: () => false,
      isRunning: () => false,
      getMode: () => 'dev',
      stop: vi.fn(() => ({ success: true })),
      start: vi.fn(() => ({ success: true })),
      clearBuildDir: vi.fn(),
      ...overrides,
    };
  }

  it('passthrough: runs the operation, never stops or starts', async () => {
    const deps = makeDeps();
    const op = vi.fn(async () => 'done');
    const out = await runWithDevServerGuard(makeProject(), op, {}, deps);
    expect(out.decision).toBe('passthrough');
    expect(out.blocked).toBe(false);
    expect(out.result).toBe('done');
    expect(op).toHaveBeenCalledTimes(1);
    expect(deps.stop).not.toHaveBeenCalled();
    expect(deps.start).not.toHaveBeenCalled();
  });

  it('block-self: does NOT run the operation and reports blocked', async () => {
    const deps = makeDeps({ isSelf: () => true });
    const op = vi.fn(async () => 'done');
    const out = await runWithDevServerGuard(makeProject(), op, {}, deps);
    expect(out.decision).toBe('block-self');
    expect(out.blocked).toBe(true);
    expect(out.result).toBeUndefined();
    expect(op).not.toHaveBeenCalled();
    expect(deps.stop).not.toHaveBeenCalled();
    expect(deps.start).not.toHaveBeenCalled();
  });

  it('orchestrate: stop -> op -> clear -> restart, in order, with the captured mode', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      isRunning: () => true,
      getMode: () => 'prod',
      stop: vi.fn(() => { calls.push('stop'); return { success: true }; }),
      start: vi.fn((_p, mode) => { calls.push(`start:${mode}`); return { success: true }; }),
      clearBuildDir: vi.fn(() => { calls.push('clear'); }),
    });
    const op = vi.fn(async () => { calls.push('op'); return 'r'; });
    const out = await runWithDevServerGuard(makeProject(), op, { clearBuildDir: true }, deps);
    expect(out.decision).toBe('orchestrate');
    expect(out.result).toBe('r');
    expect(out.stopped).toBe(true);
    expect(out.restarted).toBe(true);
    expect(calls).toEqual(['stop', 'op', 'clear', 'start:prod']);
  });

  it('orchestrate: does not clear the build dir unless asked', async () => {
    const deps = makeDeps({ isRunning: () => true });
    await runWithDevServerGuard(makeProject(), async () => 'r', {}, deps);
    expect(deps.clearBuildDir).not.toHaveBeenCalled();
    expect(deps.start).toHaveBeenCalledTimes(1);
  });

  it('orchestrate: restarts the server even when the operation throws, then rethrows', async () => {
    const deps = makeDeps({ isRunning: () => true });
    const op = vi.fn(async () => { throw new Error('install failed'); });
    await expect(runWithDevServerGuard(makeProject(), op, {}, deps)).rejects.toThrow('install failed');
    expect(deps.stop).toHaveBeenCalledTimes(1);
    expect(deps.start).toHaveBeenCalledTimes(1); // server restored in finally
  });

  it('orchestrate: surfaces a restart failure without masking the operation result', async () => {
    const deps = makeDeps({
      isRunning: () => true,
      start: vi.fn(() => ({ success: false, error: 'port in use' })),
    });
    const out = await runWithDevServerGuard(makeProject(), async () => 'ok', {}, deps);
    expect(out.result).toBe('ok');
    expect(out.restarted).toBe(false);
    expect(out.restartError).toBe('port in use');
  });
});
