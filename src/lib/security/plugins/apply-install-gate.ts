import type { ProjectConfig } from '../../types';
import type { InstallGatePlugin, InstallGateResult, InstallGateWrapped } from './types';

export interface GateRun {
  pluginId: string;
  blocked: boolean;
  message?: string;
  advisoryRefs?: string[];
}

export interface AppliedInstallGate {
  /** Final command after all gates have wrapped it. */
  command: ReadonlyArray<string>;
  env: NodeJS.ProcessEnv;
  /** Per-plugin wrapped objects in the order they were applied. */
  gates: ReadonlyArray<{ pluginId: string; wrapped: InstallGateWrapped }>;
  /** Calls onResult for every gate (in reverse application order). */
  processResult(result: { code: number; stdout: string; stderr: string }): Promise<{
    blocked: boolean;
    firstBlocker?: { pluginId: string; message?: string; advisoryRefs?: string[] };
    gates: ReadonlyArray<GateRun>;
  }>;
}

export async function applyInstallGate(args: {
  project: ProjectConfig;
  command: ReadonlyArray<string>;
  env: NodeJS.ProcessEnv;
  plugins: ReadonlyArray<InstallGatePlugin>;
}): Promise<AppliedInstallGate> {
  let command: ReadonlyArray<string> = args.command;
  let env: NodeJS.ProcessEnv = args.env;
  const gates: Array<{ pluginId: string; wrapped: InstallGateWrapped }> = [];

  for (const p of args.plugins) {
    const wrapped = await p.wrapInstall({ project: args.project, command, env });
    command = wrapped.command;
    env = wrapped.env;
    gates.push({ pluginId: p.id, wrapped });
  }

  return {
    command,
    env,
    gates,
    async processResult(result) {
      const runs: GateRun[] = [];
      let firstBlocker: { pluginId: string; message?: string; advisoryRefs?: string[] } | undefined;
      // reverse order so the outermost (last-applied) wrapper sees the raw result first
      for (let i = gates.length - 1; i >= 0; i--) {
        const g = gates[i];
        const r: InstallGateResult = await g.wrapped.onResult(result);
        runs.unshift({ pluginId: g.pluginId, blocked: r.blocked, message: r.message, advisoryRefs: r.advisoryRefs });
        if (r.blocked && !firstBlocker) {
          firstBlocker = { pluginId: g.pluginId, message: r.message, advisoryRefs: r.advisoryRefs };
        }
      }
      return { blocked: !!firstBlocker, firstBlocker, gates: runs };
    },
  };
}
