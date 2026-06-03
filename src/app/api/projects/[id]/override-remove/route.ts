import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectPackageManager } from '@/lib/patch-scanner';
import { invalidateProjectCache } from '@/lib/patch-storage';
import { AUTO_APPLY_ENABLED } from '@/lib/auto-apply-flag';
import { runWithDevServerGuard, decideDevServerGuard, isHexopsSelf, isTracked } from '@/lib/process-manager';

const execAsync = promisify(exec);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!AUTO_APPLY_ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Auto-apply is disabled in HexOps. Re-enable AUTO_APPLY_ENABLED to apply updates.' },
        { status: 409 },
      );
    }

    const { id } = await params;
    const { package: pkgName } = await request.json();

    if (!pkgName || typeof pkgName !== 'string') {
      return NextResponse.json({ error: 'package name required' }, { status: 400 });
    }

    const project = getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // #109: refuse to churn node_modules out from under hexops's own dev server.
    const guard = decideDevServerGuard({ isSelf: isHexopsSelf(project), isTracked: isTracked(id) });
    if (guard.action === 'block-self') {
      return NextResponse.json(
        { success: false, error: guard.reason, devServerGuard: { action: guard.action, reason: guard.reason } },
        { status: 409 },
      );
    }

    const pkgJsonPath = join(project.path, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      return NextResponse.json({ error: 'package.json not found' }, { status: 400 });
    }

    const pm = detectPackageManager(project.path);

    let pkgJsonRaw: string;
    let pkgJson: Record<string, unknown>;
    try {
      pkgJsonRaw = readFileSync(pkgJsonPath, 'utf-8');
      pkgJson = JSON.parse(pkgJsonRaw);
    } catch {
      return NextResponse.json({ error: 'Failed to read package.json' }, { status: 500 });
    }

    let removed = false;

    if (pm === 'pnpm') {
      const pnpmSection = pkgJson.pnpm as Record<string, unknown> | undefined;
      const overrides = pnpmSection?.overrides as Record<string, string> | undefined;
      if (overrides && pkgName in overrides) {
        delete overrides[pkgName];
        removed = true;
        if (pnpmSection && Object.keys(overrides).length === 0) {
          delete (pnpmSection as Record<string, unknown>).overrides;
        }
      }
    } else if (pm === 'yarn') {
      const resolutions = pkgJson.resolutions as Record<string, string> | undefined;
      if (resolutions && pkgName in resolutions) {
        delete resolutions[pkgName];
        removed = true;
        if (Object.keys(resolutions).length === 0) delete pkgJson.resolutions;
      }
    } else {
      const overrides = pkgJson.overrides as Record<string, unknown> | undefined;
      if (overrides && pkgName in overrides) {
        delete overrides[pkgName];
        removed = true;
        if (Object.keys(overrides).length === 0) delete pkgJson.overrides;
      }
    }

    if (!removed) {
      return NextResponse.json({ error: `No override found for ${pkgName}` }, { status: 404 });
    }

    const indent = pkgJsonRaw.match(/^(\s+)/m)?.[1] || '  ';
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, indent) + '\n', 'utf-8');

    // Reinstall to apply the removal
    const installCmd = pm === 'pnpm'
      ? 'pnpm install --no-frozen-lockfile'
      : pm === 'yarn'
      ? 'yarn install'
      : 'npm install --legacy-peer-deps';

    // #109: stop a running dev server, reinstall, then restart it.
    const guardOutcome = await runWithDevServerGuard(project, async () => {
      try {
        const result = await execAsync(installCmd, { cwd: project.path, timeout: 120000 });
        return (result.stdout || '') + (result.stderr || '');
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        return (e.stdout || '') + (e.stderr || '');
      }
    }, { clearBuildDir: true });

    invalidateProjectCache(id);

    return NextResponse.json({
      success: true,
      removed: pkgName,
      output: guardOutcome.result ?? '',
      devServerGuard: {
        action: guardOutcome.decision,
        stopped: guardOutcome.stopped,
        restarted: guardOutcome.restarted,
        ...(guardOutcome.restartError ? { restartError: guardOutcome.restartError } : {}),
      },
    });
  } catch (error) {
    console.error('Error removing override:', error);
    return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 });
  }
}
