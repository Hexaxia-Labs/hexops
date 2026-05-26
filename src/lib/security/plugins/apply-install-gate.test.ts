import { describe, it, expect } from 'vitest';
import type { InstallGatePlugin } from './types';
import type { ProjectConfig } from '../../types';
import { applyInstallGate } from './apply-install-gate';

const project = { id: 'demo', name: 'Demo', path: '/tmp/demo' } as ProjectConfig;

const passthrough: InstallGatePlugin = {
  id: 'pass',
  name: 'Pass',
  description: '',
  kind: 'installGate',
  isAvailable: async () => ({ available: true }),
  renderCard: async () => ({ status: 'disabled', headline: '' }),
  wrapInstall: async (a) => ({ command: a.command, env: a.env, onResult: async () => ({ blocked: false }) }),
};

const rewriter: InstallGatePlugin = {
  id: 'rw',
  name: 'Rw',
  description: '',
  kind: 'installGate',
  isAvailable: async () => ({ available: true }),
  renderCard: async () => ({ status: 'enabled', headline: '' }),
  wrapInstall: async (a) => ({ command: ['wrapped-' + a.command[0], ...a.command.slice(1)], env: a.env, onResult: async () => ({ blocked: false }) }),
};

const blocker: InstallGatePlugin = {
  id: 'blk',
  name: 'Blk',
  description: '',
  kind: 'installGate',
  isAvailable: async () => ({ available: true }),
  renderCard: async () => ({ status: 'enabled', headline: '' }),
  wrapInstall: async (a) => ({ command: a.command, env: a.env, onResult: async () => ({ blocked: true, message: 'no', advisoryRefs: ['X-1'] }) }),
};

describe('applyInstallGate', () => {
  it('returns the original command when no plugins', async () => {
    const out = await applyInstallGate({ project, command: ['pnpm', 'install'], env: process.env, plugins: [] });
    expect(out.command).toEqual(['pnpm', 'install']);
    expect(out.gates).toEqual([]);
  });

  it('chains wrapInstall left-to-right', async () => {
    const out = await applyInstallGate({ project, command: ['pnpm', 'install'], env: process.env, plugins: [rewriter, rewriter] });
    expect(out.command).toEqual(['wrapped-wrapped-pnpm', 'install']);
  });

  it('processResult returns the first block (right-to-left) and aggregates', async () => {
    const out = await applyInstallGate({ project, command: ['pnpm', 'install'], env: process.env, plugins: [passthrough, blocker, passthrough] });
    const summary = await out.processResult({ code: 1, stdout: '', stderr: '' });
    expect(summary.blocked).toBe(true);
    expect(summary.firstBlocker).toEqual({ pluginId: 'blk', message: 'no', advisoryRefs: ['X-1'] });
    expect(summary.gates.find((g) => g.pluginId === 'blk')?.blocked).toBe(true);
  });

  it('processResult.blocked is false when every gate clears', async () => {
    const out = await applyInstallGate({ project, command: ['pnpm', 'install'], env: process.env, plugins: [passthrough, passthrough] });
    const summary = await out.processResult({ code: 0, stdout: '', stderr: '' });
    expect(summary.blocked).toBe(false);
    expect(summary.firstBlocker).toBeUndefined();
  });
});
