import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from '../../types';
import type { SecurityPlugin } from './types';
import { runAllPluginCards } from './runner';

const project = { id: 'demo', name: 'Demo', path: '/tmp/demo' } as ProjectConfig;

const happyPlugin: SecurityPlugin = {
  id: 'happy',
  name: 'Happy',
  description: 'a plugin that works',
  kind: 'installGate',
  isAvailable: async () => ({ available: true }),
  renderCard: async () => ({ status: 'enabled', headline: 'all good' }),
  wrapInstall: async (args) => ({
    command: args.command,
    env: args.env,
    onResult: async () => ({ blocked: false }),
  }),
};

const unavailablePlugin: SecurityPlugin = {
  id: 'missing',
  name: 'Missing',
  description: 'host missing',
  kind: 'installGate',
  isAvailable: async () => ({ available: false, reason: 'not installed' }),
  renderCard: async () => ({ status: 'host-missing', headline: 'install required' }),
  wrapInstall: async (args) => ({ command: args.command, env: args.env, onResult: async () => ({ blocked: false }) }),
};

const throwingPlugin: SecurityPlugin = {
  id: 'broken',
  name: 'Broken',
  description: 'throws',
  kind: 'installGate',
  isAvailable: async () => { throw new Error('boom'); },
  renderCard: async () => { throw new Error('also boom'); },
  wrapInstall: async (args) => ({ command: args.command, env: args.env, onResult: async () => ({ blocked: false }) }),
};

describe('runAllPluginCards', () => {
  it('returns one entry per plugin in input order', async () => {
    const out = await runAllPluginCards(project, [happyPlugin, unavailablePlugin]);
    expect(out.map((e) => e.pluginId)).toEqual(['happy', 'missing']);
  });

  it('returns host status + card data for available plugins', async () => {
    const out = await runAllPluginCards(project, [happyPlugin]);
    expect(out[0].host).toEqual({ available: true });
    expect(out[0].card).toEqual({ status: 'enabled', headline: 'all good' });
  });

  it('returns host status for unavailable plugins', async () => {
    const out = await runAllPluginCards(project, [unavailablePlugin]);
    expect(out[0].host).toMatchObject({ available: false });
    expect(out[0].card.status).toBe('host-missing');
  });

  it('isolates errors: throwing plugin yields an error card without crashing the run', async () => {
    const out = await runAllPluginCards(project, [throwingPlugin, happyPlugin]);
    expect(out[0].card.status).toBe('error');
    expect(out[0].card.error).toContain('boom');
    expect(out[1].card.status).toBe('enabled'); // others still ran
  });

  it('runs plugins in parallel (faster than serial)', async () => {
    const slow = (ms: number): SecurityPlugin => ({
      id: `slow-${ms}`,
      name: 'slow',
      description: '',
      kind: 'installGate',
      isAvailable: async () => { await new Promise((r) => setTimeout(r, ms)); return { available: true }; },
      renderCard: async () => ({ status: 'enabled', headline: 'ok' }),
      wrapInstall: async (a) => ({ command: a.command, env: a.env, onResult: async () => ({ blocked: false }) }),
    });
    const start = Date.now();
    await runAllPluginCards(project, [slow(100), slow(100), slow(100)]);
    expect(Date.now() - start).toBeLessThan(250);  // 3x100ms serial would be ~300
  });
});
