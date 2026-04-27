import { execAsync } from './common';

export const ARBORIST_ERROR_PATTERNS = [
  'ERESOLVE',
  "Cannot read properties of null",
  'TypeError: Cannot read properties',
];

export function isArboristError(stderr: string, message?: string): boolean {
  const text = `${stderr}\n${message || ''}`;
  return ARBORIST_ERROR_PATTERNS.some(pattern => text.includes(pattern));
}

export async function checkNodeModulesHealth(cwd: string): Promise<{ healthy: boolean; reason?: string }> {
  try {
    const { stderr } = await execAsync('npm ls --depth=0 --json 2>&1 || true', { cwd, timeout: 30000 });
    if (stderr.includes('Cannot read properties of null') || stderr.includes('ERR!')) {
      return { healthy: false, reason: 'Corrupted dependency tree detected' };
    }
    return { healthy: true };
  } catch {
    return { healthy: false, reason: 'Unable to read dependency tree' };
  }
}

export async function cleanNodeModules(cwd: string): Promise<boolean> {
  try {
    await execAsync('rm -rf node_modules package-lock.json', { cwd, timeout: 30000 });
    await execAsync('npm install --legacy-peer-deps', { cwd, timeout: 180000 });
    return true;
  } catch {
    return false;
  }
}

export function buildNpmInstallCmd(specs: string | string[], isWorkspace: boolean): string {
  const s = Array.isArray(specs) ? specs.join(' ') : specs;
  return isWorkspace
    ? `npm install ${s} --legacy-peer-deps --workspaces --include-workspace-root`
    : `npm install ${s} --legacy-peer-deps`;
}

export function buildNpmUpdateCmd(isWorkspace: boolean): string {
  return isWorkspace
    ? 'npm update --legacy-peer-deps --workspaces --include-workspace-root'
    : 'npm update --legacy-peer-deps';
}
