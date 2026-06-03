import type { ProjectConfig } from '../../../types';
import type { InstallGatePlugin, InstallGateWrapped, PluginCardData, PluginHostStatus } from '../types';
import { isPluginEnabledForProject } from '../config';
import { isSafeChainAvailable } from './availability';
import { rewriteCommandForSafeChain } from './rewrite';
import { parseSafeChainResult } from './parse-result';

const PLUGIN_ID = 'safe-chain';
const INSTALL_HINT = 'Install: npm i -g @aikidosec/safe-chain';

// Dependency-injection seam so tests don't shell `safe-chain` on the host.
interface Deps {
  isAvailable(): Promise<PluginHostStatus>;
}
const realDeps: Deps = { isAvailable: () => isSafeChainAvailable() };

async function renderCard(
  project: ProjectConfig,
  deps: Deps = realDeps,
): Promise<PluginCardData> {
  const host = await deps.isAvailable();
  const enabled = isPluginEnabledForProject(project, PLUGIN_ID);

  if (!host.available) {
    return {
      status: 'host-missing',
      headline: 'Safe Chain not installed',
      detail: host.installHint ?? INSTALL_HINT,
      detailRoute: '/security/safe-chain',
    };
  }
  if (!enabled) {
    return {
      status: 'disabled',
      headline: 'Disabled for this project',
      detail: host.version ? `safe-chain v${host.version}` : undefined,
      detailRoute: '/security/safe-chain',
    };
  }
  return {
    status: 'enabled',
    headline: 'enabled · 0 blocks · last 7d',
    detail: host.version ? `safe-chain v${host.version}` : undefined,
    detailRoute: '/security/safe-chain',
  };
}

async function wrapInstall(
  args: { project: ProjectConfig; command: ReadonlyArray<string>; env: NodeJS.ProcessEnv },
  deps: Deps = realDeps,
): Promise<InstallGateWrapped> {
  const enabled = isPluginEnabledForProject(args.project, PLUGIN_ID);
  const host = enabled ? await deps.isAvailable() : { available: false as const, reason: 'disabled', installHint: '' };
  if (!enabled || !host.available) {
    return {
      command: [...args.command],
      env: args.env,
      onResult: async () => ({ blocked: false }),
    };
  }
  return {
    command: rewriteCommandForSafeChain(args.command),
    env: args.env,
    onResult: async (r) => parseSafeChainResult(r),
  };
}

export const SafeChainPlugin: InstallGatePlugin = {
  id: PLUGIN_ID,
  name: 'Aikido Safe Chain',
  description: 'Pre-install malware/typosquat interceptor for npm/pnpm/yarn.',
  kind: 'installGate',
  detailRoute: '/security/safe-chain',
  isAvailable: () => isSafeChainAvailable(),
  renderCard: (project) => renderCard(project),
  wrapInstall: (args) => wrapInstall(args),
};

// Test-only re-exports so plugin.test.ts can inject deps.
export const _internals = { renderCard, wrapInstall };
