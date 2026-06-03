import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectConfig } from '../../types';
import { getProjectPluginConfig, isPluginEnabledForProject, setProjectPluginConfig } from './config';

const mockProject: ProjectConfig = {
  id: 'demo',
  name: 'Demo',
  path: '/tmp/demo',
} as ProjectConfig;

describe('plugin per-project config', () => {
  it('getProjectPluginConfig returns undefined when no plugins block', () => {
    expect(getProjectPluginConfig(mockProject, 'safe-chain')).toBeUndefined();
  });

  it('getProjectPluginConfig returns the per-plugin entry when present', () => {
    const p = { ...mockProject, plugins: { 'safe-chain': { enabled: true } } };
    expect(getProjectPluginConfig(p, 'safe-chain')).toEqual({ enabled: true });
  });

  it('isPluginEnabledForProject defaults to false (opt-in)', () => {
    expect(isPluginEnabledForProject(mockProject, 'safe-chain')).toBe(false);
  });

  it('isPluginEnabledForProject is true only when enabled === true', () => {
    expect(isPluginEnabledForProject({ ...mockProject, plugins: { 'safe-chain': {} } }, 'safe-chain')).toBe(false);
    expect(isPluginEnabledForProject({ ...mockProject, plugins: { 'safe-chain': { enabled: false } } }, 'safe-chain')).toBe(false);
    expect(isPluginEnabledForProject({ ...mockProject, plugins: { 'safe-chain': { enabled: true } } }, 'safe-chain')).toBe(true);
  });

  describe('setProjectPluginConfig', () => {
    const writeMock = vi.fn();
    beforeEach(() => writeMock.mockReset());

    it('merges into existing plugins block via the injected writer', async () => {
      const before: ProjectConfig = { ...mockProject, plugins: { other: { enabled: true } } };
      await setProjectPluginConfig(before, 'safe-chain', { enabled: true }, writeMock);
      expect(writeMock).toHaveBeenCalledWith({
        ...before,
        plugins: { other: { enabled: true }, 'safe-chain': { enabled: true } },
      });
    });

    it('creates the plugins block when missing', async () => {
      await setProjectPluginConfig(mockProject, 'safe-chain', { enabled: true }, writeMock);
      expect(writeMock).toHaveBeenCalledWith({
        ...mockProject,
        plugins: { 'safe-chain': { enabled: true } },
      });
    });
  });
});
