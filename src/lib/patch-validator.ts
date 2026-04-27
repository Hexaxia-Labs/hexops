import { execFile } from 'child_process';
import { promisify } from 'util';
import { detectPackageManager } from './patch-scanner';

const execFileAsync = promisify(execFile);

export interface ValidationPackage {
  name: string;
  fromVersion?: string;
  toVersion: string;
}

export interface ValidationResult {
  projectId: string;
  packages: ValidationPackage[];
  buildPassed: boolean;
  buildOutput: string;
  duration: number;
  timestamp: string;
  error?: string;
}

export type ValidationPhase = 'installing' | 'building' | 'complete' | 'error';

export interface ValidationProgress {
  phase: ValidationPhase;
  message?: string;
}

const TIMEOUT_INSTALL = 3 * 60 * 1000;
const TIMEOUT_BUILD = 5 * 60 * 1000;

const INSTALL_CMD: Record<string, [string, string[]]> = {
  pnpm: ['pnpm', ['add']],
  npm: ['npm', ['install']],
  yarn: ['yarn', ['add']],
};

/**
 * Validates a set of package updates in a git worktree without touching the real project.
 * Calls onProgress with phase updates as each step completes.
 */
export async function validatePatches(
  projectPath: string,
  projectId: string,
  packages: ValidationPackage[],
  buildScript: string | undefined,
  onProgress: (p: ValidationProgress) => void,
  signal?: AbortSignal,
): Promise<ValidationResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const worktreeId = `validate-${projectId.slice(0, 8)}-${Date.now()}`;
  const worktreePath = `/tmp/hexops-${worktreeId}`;

  const cleanup = async () => {
    await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: projectPath,
      timeout: 15000,
    }).catch(() => {});
  };

  try {
    // Create a detached worktree on HEAD
    await execFileAsync(
      'git',
      ['worktree', 'add', '--detach', worktreePath, 'HEAD'],
      { cwd: projectPath, timeout: 15000 },
    );

    if (signal?.aborted) throw new Error('Cancelled');

    const pm = detectPackageManager(worktreePath);
    const [installCmd, installBaseArgs] = INSTALL_CMD[pm];

    onProgress({ phase: 'installing', message: `Installing ${packages.map((p) => p.name).join(', ')}` });

    // Build the install command: pnpm add pkg@version...
    const installArgs = [
      ...installBaseArgs,
      ...packages.map((p) => `${p.name}@${p.toVersion}`),
      ...(pm === 'pnpm' ? ['--no-frozen-lockfile'] : pm === 'npm' ? ['--legacy-peer-deps'] : []),
    ];

    let installOutput = '';
    try {
      const result = await execFileAsync(installCmd, installArgs, {
        cwd: worktreePath,
        timeout: TIMEOUT_INSTALL,
      });
      installOutput = (result.stdout ?? '') + (result.stderr ?? '');
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      installOutput = (e.stdout ?? '') + (e.stderr ?? '');
      await cleanup();
      return {
        projectId,
        packages,
        buildPassed: false,
        buildOutput: `Install failed:\n${installOutput}`,
        duration: Date.now() - start,
        timestamp,
        error: `Install failed: ${e.message ?? 'unknown'}`,
      };
    }

    if (signal?.aborted) {
      await cleanup();
      throw new Error('Cancelled');
    }

    if (!buildScript) {
      await cleanup();
      return {
        projectId,
        packages,
        buildPassed: true,
        buildOutput: installOutput + '\n(No build script configured — install only)',
        duration: Date.now() - start,
        timestamp,
      };
    }

    onProgress({ phase: 'building', message: `Running: ${buildScript}` });

    const [buildCmd, ...buildArgs] = buildScript.split(' ');
    let buildOutput = '';
    let buildPassed = false;
    try {
      const result = await execFileAsync(buildCmd, buildArgs, {
        cwd: worktreePath,
        timeout: TIMEOUT_BUILD,
        shell: true,
        env: { ...process.env, NODE_ENV: 'production', CI: 'true' },
      });
      buildOutput = (result.stdout ?? '') + (result.stderr ?? '');
      buildPassed = true;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      buildOutput = (e.stdout ?? '') + (e.stderr ?? '');
      buildPassed = false;
    }

    await cleanup();

    return {
      projectId,
      packages,
      buildPassed,
      buildOutput: (installOutput + '\n' + buildOutput).trim(),
      duration: Date.now() - start,
      timestamp,
    };
  } catch (err) {
    await cleanup();
    const message = err instanceof Error ? err.message : String(err);
    return {
      projectId,
      packages,
      buildPassed: false,
      buildOutput: '',
      duration: Date.now() - start,
      timestamp,
      error: message,
    };
  }
}
