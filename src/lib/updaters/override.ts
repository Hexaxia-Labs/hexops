import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execAsync, NPM_INSTALL_TIMEOUT, type UpdatePackage, type UpdateResult } from './common';
import { addPatchHistoryEntry, generatePatchId } from '@/lib/patch-storage';
import { getUpdateType } from '@/lib/patch-scanner';
import { logger } from '@/lib/logger';

function pkgJsonIndent(raw: string): string {
  return raw.match(/^(\s+)/m)?.[1] || '  ';
}

/** Remove override/resolution entries that conflict with a direct-dep update. */
export function removeOverrideConflicts(
  pkgJsonPath: string,
  directPkgs: UpdatePackage[],
  packageManager: string,
  projectId: string,
): void {
  try {
    const raw = readFileSync(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(raw);
    const pnpmOverrides: Record<string, string> | undefined = pkgJson?.pnpm?.overrides;
    const npmOverrides: Record<string, string> | undefined = pkgJson?.overrides;
    const yarnResolutions: Record<string, string> | undefined = pkgJson?.resolutions;
    let changed = false;

    for (const pkg of directPkgs) {
      const isFloating = /^(latest|next|canary)$/.test(pkg.targetVersion);
      if (pnpmOverrides?.[pkg.name] !== undefined) {
        const pinned = pnpmOverrides[pkg.name];
        if (isFloating || pinned !== pkg.targetVersion) {
          delete pkgJson.pnpm.overrides[pkg.name];
          changed = true;
          logger.info('patches', 'override_conflict_removed', `Removed conflicting pnpm.overrides[${pkg.name}]=${pinned} before updating to ${pkg.targetVersion}`, { projectId, meta: { package: pkg.name } });
        }
      }
      if (npmOverrides?.[pkg.name] !== undefined) {
        const pinned = npmOverrides[pkg.name];
        if (isFloating || pinned !== pkg.targetVersion) {
          delete pkgJson.overrides[pkg.name];
          changed = true;
          logger.info('patches', 'override_conflict_removed', `Removed conflicting overrides[${pkg.name}]=${pinned} before updating to ${pkg.targetVersion}`, { projectId, meta: { package: pkg.name } });
        }
      }
      if (yarnResolutions?.[pkg.name] !== undefined) {
        const pinned = yarnResolutions[pkg.name];
        if (isFloating || pinned !== pkg.targetVersion) {
          delete pkgJson.resolutions[pkg.name];
          changed = true;
          logger.info('patches', 'override_conflict_removed', `Removed conflicting resolutions[${pkg.name}]=${pinned} before updating to ${pkg.targetVersion}`, { projectId, meta: { package: pkg.name } });
        }
      }
    }

    if (changed) writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, pkgJsonIndent(raw)) + '\n', 'utf-8');
  } catch {
    // Non-fatal
  }
}

/** Remove override entries where the installed version is already newer than the pin. */
export function cleanStaleOverrides(
  cwd: string,
  packageManager: string,
  projectId: string,
): void {
  try {
    const pkgJsonPath = join(cwd, 'package.json');
    const raw = readFileSync(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(raw);

    const overridesObj: Record<string, string> | undefined =
      packageManager === 'pnpm' ? pkgJson?.pnpm?.overrides :
      packageManager === 'npm' ? pkgJson?.overrides :
      pkgJson?.resolutions;

    if (!overridesObj || Object.keys(overridesObj).length === 0) return;

    const staleKeys: string[] = [];
    for (const [overridePkg, pinnedVersion] of Object.entries(overridesObj)) {
      try {
        const nmPath = join(cwd, 'node_modules', overridePkg, 'package.json');
        if (existsSync(nmPath)) {
          const installed = JSON.parse(readFileSync(nmPath, 'utf-8')).version;
          if (installed && pinnedVersion && !/^[<>=^~]/.test(pinnedVersion)) {
            const iv = installed.split('.').map((n: string) => parseInt(n, 10) || 0);
            const pv = pinnedVersion.split('.').map((n: string) => parseInt(n, 10) || 0);
            const isNewer = iv[0] > pv[0] || (iv[0] === pv[0] && iv[1] > pv[1]) || (iv[0] === pv[0] && iv[1] === pv[1] && (iv[2] ?? 0) > (pv[2] ?? 0));
            if (isNewer) staleKeys.push(overridePkg);
          }
        }
      } catch { /* skip entry */ }
    }

    if (staleKeys.length > 0) {
      for (const key of staleKeys) delete overridesObj[key];
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, pkgJsonIndent(raw)) + '\n', 'utf-8');
      logger.info('patches', 'stale_overrides_removed', `Removed ${staleKeys.length} stale override(s): ${staleKeys.join(', ')}`, {
        projectId,
        meta: { removed: staleKeys },
      });
    }
  } catch {
    // Non-fatal
  }
}

/** Apply package manager overrides for transitive dependencies. */
export async function applyOverrides(
  overridePkgs: UpdatePackage[],
  packageManager: string,
  cwd: string,
  projectId: string,
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  // Resolve "resolve-latest" versions
  for (const pkg of overridePkgs) {
    if (pkg.targetVersion === 'resolve-latest') {
      try {
        const viewCmd = packageManager === 'pnpm'
          ? `pnpm view ${pkg.name} version`
          : packageManager === 'yarn'
          ? `yarn info ${pkg.name} version`
          : `npm view ${pkg.name} version`;
        const { stdout } = await execAsync(viewCmd, { cwd, timeout: 15000 });
        const resolved = stdout.trim();
        pkg.targetVersion = resolved && /^\d+\.\d+\.\d+/.test(resolved) ? resolved : 'latest';
      } catch {
        pkg.targetVersion = 'latest';
      }
    }
  }

  try {
    const pkgJsonPath = join(cwd, 'package.json');
    const pkgJsonRaw = readFileSync(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(pkgJsonRaw);

    if (packageManager === 'pnpm') {
      if (!pkgJson.pnpm) pkgJson.pnpm = {};
      if (!pkgJson.pnpm.overrides) pkgJson.pnpm.overrides = {};
      for (const pkg of overridePkgs) pkgJson.pnpm.overrides[pkg.name] = pkg.targetVersion;
    } else if (packageManager === 'npm') {
      if (!pkgJson.overrides) pkgJson.overrides = {};
      for (const pkg of overridePkgs) {
        if (pkgJson.dependencies?.[pkg.name] !== undefined) {
          pkgJson.dependencies[pkg.name] = pkg.targetVersion;
        } else {
          if (pkgJson.devDependencies?.[pkg.name] !== undefined) delete pkgJson.devDependencies[pkg.name];
          pkgJson.overrides[pkg.name] = pkg.targetVersion;
        }
      }
    } else {
      if (!pkgJson.resolutions) pkgJson.resolutions = {};
      for (const pkg of overridePkgs) pkgJson.resolutions[pkg.name] = pkg.targetVersion;
    }

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, pkgJsonIndent(pkgJsonRaw)) + '\n', 'utf-8');

    const installCmd = packageManager === 'pnpm'
      ? 'pnpm install --no-frozen-lockfile'
      : packageManager === 'npm'
      ? 'npm install --legacy-peer-deps'
      : 'yarn install';

    let installOutput = '';
    try {
      const installResult = await execAsync(installCmd, { cwd, timeout: NPM_INSTALL_TIMEOUT });
      installOutput = `$ ${installCmd}\n${installResult.stdout || ''}${installResult.stderr || ''}`;
    } catch (installErr) {
      const err = installErr as { stdout?: string; stderr?: string; message?: string };
      installOutput = `$ ${installCmd}\n${err.stdout || ''}${err.stderr || ''}`;
      const anyResolved = overridePkgs.some(pkg => {
        try {
          const p = join(cwd, 'node_modules', pkg.name, 'package.json');
          return existsSync(p) && JSON.parse(readFileSync(p, 'utf-8')).version === pkg.targetVersion;
        } catch { return false; }
      });
      if (!anyResolved) throw new Error(err.stderr || err.message || 'Install after override failed');
    }

    for (const pkg of overridePkgs) {
      let verifyWarning = '';
      try {
        const installedPkgPath = join(cwd, 'node_modules', pkg.name, 'package.json');
        if (existsSync(installedPkgPath)) {
          const installedVersion = JSON.parse(readFileSync(installedPkgPath, 'utf-8')).version;
          if (installedVersion !== pkg.targetVersion) {
            verifyWarning = ` ⚠ override written but ${pkg.name} resolved to ${installedVersion} — may need lockfile reset`;
            logger.warn('patches', 'override_version_mismatch', `Override for ${pkg.name}: expected ${pkg.targetVersion}, got ${installedVersion}`, {
              projectId,
              meta: { package: pkg.name, expected: pkg.targetVersion, actual: installedVersion },
            });
          }
        }
      } catch { /* non-fatal */ }

      results.push({
        package: pkg.name,
        success: true,
        output: `Applied override: ${pkg.name}@${pkg.targetVersion}${verifyWarning}\n${installOutput}`,
      });

      logger.info('patches', 'override_applied', `Applied override for ${pkg.name}@${pkg.targetVersion}`, {
        projectId,
        meta: { package: pkg.name, fromVersion: pkg.fromVersion || 'unknown', toVersion: pkg.targetVersion, packageManager, mechanism: 'override' },
      });

      addPatchHistoryEntry({
        id: generatePatchId(),
        timestamp: new Date().toISOString(),
        projectId,
        package: pkg.name,
        fromVersion: pkg.fromVersion || 'unknown',
        toVersion: pkg.targetVersion,
        updateType: pkg.fromVersion ? getUpdateType(pkg.fromVersion, pkg.targetVersion) : 'patch',
        trigger: 'manual',
        success: true,
        output: `Override applied: ${pkg.name}@${pkg.targetVersion}${verifyWarning}`,
      });
    }
  } catch (err) {
    const msg = (err as { message?: string }).message;
    for (const pkg of overridePkgs) {
      results.push({ package: pkg.name, success: false, output: '', error: `Failed to apply override: ${msg}` });
      logger.error('patches', 'override_failed', `Failed to apply override for ${pkg.name}: ${msg}`, {
        projectId,
        meta: { package: pkg.name },
      });
    }
  }

  return results;
}
