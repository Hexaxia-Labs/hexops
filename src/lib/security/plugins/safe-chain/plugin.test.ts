import { describe, it, expect } from 'vitest';
import { SafeChainPlugin, _internals } from './plugin';
import type { ProjectConfig } from '../../../types';

const baseProject: ProjectConfig = { id: 'demo', name: 'Demo', path: '/tmp/demo' } as ProjectConfig;

describe('SafeChainPlugin', () => {
  it('declares id, kind, detailRoute', () => {
    expect(SafeChainPlugin.id).toBe('safe-chain');
    expect(SafeChainPlugin.kind).toBe('installGate');
    expect(SafeChainPlugin.detailRoute).toBe('/security/safe-chain');
  });

  it('renderCard returns enabled when project opts in and host is available', async () => {
    const p = { ...baseProject, plugins: { 'safe-chain': { enabled: true } } };
    const card = await _internals.renderCard(p, { isAvailable: async () => ({ available: true, version: '1.5.3' }) });
    expect(card.status).toBe('enabled');
    expect(card.headline).toContain('enabled');
  });

  it('renderCard returns disabled when project does not opt in', async () => {
    const card = await _internals.renderCard(baseProject, { isAvailable: async () => ({ available: true }) });
    expect(card.status).toBe('disabled');
  });

  it('renderCard returns host-missing when binary not found', async () => {
    const p = { ...baseProject, plugins: { 'safe-chain': { enabled: true } } };
    const card = await _internals.renderCard(p, { isAvailable: async () => ({ available: false, reason: 'not in PATH' }) });
    expect(card.status).toBe('host-missing');
    expect(card.detail).toMatch(/Install/);
  });

  it('wrapInstall is a no-op when project disabled', async () => {
    const wrapped = await _internals.wrapInstall({
      project: baseProject,
      command: ['pnpm', 'install'],
      env: { FOO: '1' } as unknown as NodeJS.ProcessEnv,
    }, { isAvailable: async () => ({ available: true }) });
    expect(wrapped.command).toEqual(['pnpm', 'install']);
  });

  it('wrapInstall is a no-op when host unavailable even if project enabled', async () => {
    const p = { ...baseProject, plugins: { 'safe-chain': { enabled: true } } };
    const wrapped = await _internals.wrapInstall({
      project: p,
      command: ['pnpm', 'install'],
      env: {} as unknown as NodeJS.ProcessEnv,
    }, { isAvailable: async () => ({ available: false, reason: 'x' }) });
    expect(wrapped.command).toEqual(['pnpm', 'install']);
  });

  it('wrapInstall rewrites command when enabled + available', async () => {
    const p = { ...baseProject, plugins: { 'safe-chain': { enabled: true } } };
    const wrapped = await _internals.wrapInstall({
      project: p,
      command: ['pnpm', 'install', '--prefer-offline'],
      env: { FOO: '1' } as unknown as NodeJS.ProcessEnv,
    }, { isAvailable: async () => ({ available: true }) });
    expect(wrapped.command).toEqual(['aikido-pnpm', 'install', '--prefer-offline']);
  });

  it('wrapInstall onResult delegates to parseSafeChainResult', async () => {
    const p = { ...baseProject, plugins: { 'safe-chain': { enabled: true } } };
    const wrapped = await _internals.wrapInstall({
      project: p,
      command: ['pnpm', 'install'],
      env: {} as unknown as NodeJS.ProcessEnv,
    }, { isAvailable: async () => ({ available: true }) });
    const out = await wrapped.onResult({ code: 1, stdout: '', stderr: '[safe-chain] BLOCKED: package "x@1" matched MAL-2026-0001' });
    expect(out.blocked).toBe(true);
    expect(out.advisoryRefs).toEqual(['MAL-2026-0001']);
  });
});
