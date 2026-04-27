import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

export const NPM_INSTALL_TIMEOUT = 120000; // 2 minutes per package

export interface UpdatePackage {
  name: string;
  fromVersion?: string;
  targetVersion: string;
  fixViaOverride?: boolean;
  fixByParent?: { name: string; version: string };
}

export interface UpdateResult {
  package: string;
  success: boolean;
  output: string;
  error?: string;
}

export async function verifyAuditClear(
  cwd: string,
  packageManager: string,
  patchedPackageNames: string[],
): Promise<string[]> {
  if (patchedPackageNames.length === 0) return [];
  try {
    const auditCmd =
      packageManager === 'pnpm'
        ? 'pnpm audit --json 2>/dev/null || true'
        : packageManager === 'yarn'
        ? 'yarn audit --json 2>/dev/null || true'
        : 'npm audit --json 2>/dev/null || true';

    const { stdout } = await execAsync(auditCmd, { cwd, timeout: 60000 });

    const jsonStart = stdout.lastIndexOf('{');
    if (jsonStart === -1) return [];
    const auditData = JSON.parse(stdout.slice(jsonStart));

    const vulnerabilities: Record<string, unknown> = auditData?.vulnerabilities ?? {};
    return patchedPackageNames.filter(name => name in vulnerabilities);
  } catch {
    return [];
  }
}
