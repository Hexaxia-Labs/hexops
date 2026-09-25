import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { detectPackageManager, getDetectionSource } from './patch-scanner';
import { checkLockFileFreshness } from './lockfile-checker';
import { findMissingNpmrcVars } from './project-env';
import type { LockfileResolutionMode, LockfileResolutionResult, PackageManager } from './types';

const LOCK_FILES: Record<PackageManager, string> = {
  pnpm: 'pnpm-lock.yaml',
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
};

const INSTALL_CMD: Record<PackageManager, string> = {
  pnpm: 'pnpm install --no-frozen-lockfile',
  npm: 'npm install --legacy-peer-deps',
  yarn: 'yarn install',
};

/**
 * Env overlay merged over process.env for every install this module spawns.
 * Supplied by the caller (see buildProjectEnv in ./project-env) because the
 * hexops server's own environment lacks the registry credentials a project's
 * .npmrc may interpolate. (#142)
 */
export type ResolveEnv = Record<string, string>;

function installEnv(extraEnv?: ResolveEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...extraEnv, NODE_ENV: 'development' };
}

export async function resolveLockfile(
  projectPath: string,
  mode: LockfileResolutionMode,
  extraEnv?: ResolveEnv
): Promise<LockfileResolutionResult> {
  switch (mode) {
    case 'clean-slate':
      return cleanSlate(projectPath, extraEnv);
    case 'repair':
      return repair(projectPath, extraEnv);
    case 'preflight':
      return preflight(projectPath, extraEnv);
  }
}

/**
 * Mode A: Clean Slate
 * Delete lock file + node_modules, fresh install.
 */
async function cleanSlate(
  projectPath: string,
  extraEnv?: ResolveEnv
): Promise<LockfileResolutionResult> {
  const actions: string[] = [];
  const detectedVia = getDetectionSource(projectPath);
  const pm = detectPackageManager(projectPath);

  const env = installEnv(extraEnv);

  // Fail before deleting anything if the project's .npmrc interpolates a
  // variable we don't have. Otherwise the install is guaranteed to fail on a
  // private dependency and the lock file would already be gone. (#143)
  const missingVars = findMissingNpmrcVars(projectPath, env);
  if (missingVars.length > 0) {
    const names = missingVars.join(', ');
    actions.push(`.npmrc references unset variable(s): ${names}`);
    actions.push('Refusing to delete lock file — the install would fail on private packages');
    return {
      mode: 'clean-slate',
      success: false,
      packageManager: pm,
      detectedVia,
      actions,
      error:
        `Missing environment variable(s) required by .npmrc: ${names}. ` +
        'Set them in project settings (Env) or configure a global GitHub token, then retry.',
    };
  }

  // Snapshot every lock file before deleting so a failed install can be undone.
  // node_modules is not recoverable this way, but the lock file is the part
  // that matters — it may be uncommitted, and it anchors reproducibility. (#143)
  const backups = new Map<string, Buffer>();

  const restoreBackups = (): string[] => {
    const restored: string[] = [];
    for (const [lockPath, contents] of backups) {
      try {
        writeFileSync(lockPath, contents);
        restored.push(lockPath.slice(projectPath.length + 1));
      } catch {
        // best-effort; surfaced through the actions list
      }
    }
    return restored;
  };

  try {
    // Delete all lock files (there might be stale ones from a different PM)
    for (const [, lockFile] of Object.entries(LOCK_FILES)) {
      const lockPath = join(projectPath, lockFile);
      if (existsSync(lockPath)) {
        try {
          backups.set(lockPath, readFileSync(lockPath));
        } catch {
          // If it cannot be backed up, it must not be deleted.
          throw new Error(`Could not back up ${lockFile} before deleting it`);
        }
        unlinkSync(lockPath);
        actions.push(`Deleted ${lockFile} (backed up)`);
      }
    }

    // Delete node_modules
    const nmPath = join(projectPath, 'node_modules');
    if (existsSync(nmPath)) {
      rmSync(nmPath, { recursive: true, force: true });
      actions.push('Deleted node_modules/');
    }

    // Re-detect PM after deleting lock files (uses fallback strategies)
    const resolvedPm = detectPackageManager(projectPath);
    actions.push(`Detected package manager: ${resolvedPm} (via ${getDetectionSource(projectPath)})`);

    // Fresh install
    const cmd = INSTALL_CMD[resolvedPm];
    actions.push(`Running: ${cmd}`);
    execSync(cmd, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120_000,
      env,
    });
    actions.push('Fresh install completed');

    return {
      mode: 'clean-slate',
      success: true,
      packageManager: resolvedPm,
      detectedVia: getDetectionSource(projectPath),
      actions,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actions.push(`Error: ${message}`);

    const restored = restoreBackups();
    if (restored.length > 0) {
      actions.push(`Restored ${restored.join(', ')} after failure`);
    }
    if (backups.size > 0) {
      actions.push('node_modules/ was not restored — reinstall once the cause is fixed');
    }

    return {
      mode: 'clean-slate',
      success: false,
      packageManager: pm,
      detectedVia,
      actions,
      error: message,
    };
  }
}

/**
 * Mode B: Repair
 * Detect the issue, apply minimum fix, keep node_modules if possible.
 */
async function repair(
  projectPath: string,
  extraEnv?: ResolveEnv
): Promise<LockfileResolutionResult> {
  const actions: string[] = [];
  const pm = detectPackageManager(projectPath);
  const detectedVia = getDetectionSource(projectPath);

  const env = installEnv(extraEnv);

  try {
    const lockFile = LOCK_FILES[pm];
    const lockPath = join(projectPath, lockFile);

    // Step 1: Check if lock file exists
    if (!existsSync(lockPath)) {
      actions.push(`No ${lockFile} found, generating fresh lock file`);
      execSync(INSTALL_CMD[pm], {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 120_000,
        env,
      });
      actions.push('Lock file generated');
      return { mode: 'repair', success: true, packageManager: pm, detectedVia, actions };
    }

    // Step 2: Check freshness
    const freshness = checkLockFileFreshness(projectPath);
    if (freshness.mismatches.length > 0) {
      actions.push(`Found ${freshness.mismatches.length} stale entries in ${lockFile}`);
      for (const m of freshness.mismatches) {
        actions.push(`  ${m.package}: package.json=${m.packageJsonSpec} vs lock=${m.lockfileSpec}`);
      }
    } else {
      actions.push(`${lockFile} is in sync with package.json`);
    }

    // Step 3: Try install (with permissive flags)
    const cmd = INSTALL_CMD[pm];
    actions.push(`Running: ${cmd}`);
    try {
      execSync(cmd, {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 120_000,
        env,
      });
      actions.push('Install completed (lock file updated)');
    } catch {
      // Step 4: If install fails, delete just the lock file and retry.
      // Keep a copy so a failed retry doesn't leave the project worse off
      // than when repair started. (#143)
      actions.push('Install failed, regenerating lock file');
      const backup = readFileSync(lockPath);
      unlinkSync(lockPath);
      actions.push(`Deleted ${lockFile}`);

      try {
        execSync(cmd, {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 120_000,
          env,
        });
        actions.push('Reinstall with fresh lock file completed');
      } catch (retryErr) {
        writeFileSync(lockPath, backup);
        actions.push(`Restored ${lockFile} after failed regeneration`);
        throw retryErr;
      }
    }

    return {
      mode: 'repair',
      success: true,
      packageManager: pm,
      detectedVia,
      actions,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actions.push(`Error: ${message}`);
    return {
      mode: 'repair',
      success: false,
      packageManager: pm,
      detectedVia,
      actions,
      error: message,
    };
  }
}

/**
 * Mode C: Pre-flight Check
 * Validate lock file is installable. If not, report issues without fixing.
 */
async function preflight(
  projectPath: string,
  extraEnv?: ResolveEnv
): Promise<LockfileResolutionResult> {
  const actions: string[] = [];
  const pm = detectPackageManager(projectPath);
  const detectedVia = getDetectionSource(projectPath);
  const lockFile = LOCK_FILES[pm];
  const lockPath = join(projectPath, lockFile);

  const env = installEnv(extraEnv);

  // Surface a credential gap here too — preflight exists to answer
  // "would an install work?", and an unexpandable .npmrc var means no. (#142)
  const missingVars = findMissingNpmrcVars(projectPath, env);
  if (missingVars.length > 0) {
    const names = missingVars.join(', ');
    actions.push(`.npmrc references unset variable(s): ${names}`);
    return {
      mode: 'preflight',
      success: false,
      packageManager: pm,
      detectedVia,
      actions,
      error: `Missing environment variable(s) required by .npmrc: ${names}`,
    };
  }

  // Check 1: Lock file exists
  if (!existsSync(lockPath)) {
    actions.push(`No ${lockFile} found — install required before patching`);
    return {
      mode: 'preflight',
      success: false,
      packageManager: pm,
      detectedVia,
      actions,
      error: `Missing ${lockFile}`,
    };
  }

  // Check 2: Freshness
  const freshness = checkLockFileFreshness(projectPath);
  if (freshness.mismatches.length > 0) {
    actions.push(`${freshness.mismatches.length} packages out of sync between package.json and ${lockFile}`);
    for (const m of freshness.mismatches) {
      actions.push(`  ${m.package}: package.json=${m.packageJsonSpec} vs lock=${m.lockfileSpec}`);
    }
  }

  // Check 3: Try a dry-run install
  try {
    if (pm === 'npm') {
      execSync('npm install --dry-run --legacy-peer-deps', {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 60_000,
        env,
      });
      actions.push('npm dry-run install: OK');
    } else if (pm === 'pnpm') {
      execSync('pnpm install --lockfile-only', {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 60_000,
        env,
      });
      actions.push('pnpm lockfile-only install: OK');
    } else {
      actions.push(`Dry-run not supported for ${pm}, skipping`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actions.push(`Install check failed: ${message}`);
    return {
      mode: 'preflight',
      success: false,
      packageManager: pm,
      detectedVia,
      actions,
      error: `Lock file is not installable: ${message}`,
    };
  }

  const isHealthy = freshness.mismatches.length === 0;
  if (isHealthy) {
    actions.push('Lock file is healthy');
  } else {
    actions.push('Lock file has mismatches but is installable — recommend repair');
  }

  return {
    mode: 'preflight',
    success: true,
    packageManager: pm,
    detectedVia,
    actions,
  };
}
