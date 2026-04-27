import { execAsync } from './common';

export async function checkPnpmLockfileHealth(cwd: string): Promise<{ healthy: boolean; reason?: string }> {
  try {
    const { stdout, stderr } = await execAsync('pnpm install --frozen-lockfile 2>&1 || true', {
      cwd,
      timeout: 60000,
    });
    const output = `${stdout}\n${stderr}`;
    if (output.includes('ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY') || output.includes('ERR_PNPM_OUTDATED_LOCKFILE')) {
      const errorMatch = output.match(/ERR_PNPM_\w+/);
      return { healthy: false, reason: errorMatch?.[0] || 'Broken pnpm lockfile' };
    }
    return { healthy: true };
  } catch {
    return { healthy: false, reason: 'Unable to verify pnpm lockfile' };
  }
}

export async function repairPnpmLockfile(cwd: string): Promise<boolean> {
  try {
    await execAsync('rm -f pnpm-lock.yaml', { cwd, timeout: 5000 });
    await execAsync('pnpm install --no-frozen-lockfile', { cwd, timeout: 180000 });
    return true;
  } catch {
    return false;
  }
}

export function buildPnpmInstallCmd(specs: string | string[], isWorkspace: boolean): string {
  const s = Array.isArray(specs) ? specs.join(' ') : specs;
  return isWorkspace ? `pnpm add ${s} -r` : `pnpm add ${s}`;
}

export function buildPnpmUpdateCmd(isWorkspace: boolean): string {
  return isWorkspace ? 'pnpm update -r' : 'pnpm update';
}
