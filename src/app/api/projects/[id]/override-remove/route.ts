import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { detectPackageManager } from '@/lib/patch-scanner';
import { invalidateProjectCache } from '@/lib/patch-storage';

const execAsync = promisify(exec);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { package: pkgName } = await request.json();

    if (!pkgName || typeof pkgName !== 'string') {
      return NextResponse.json({ error: 'package name required' }, { status: 400 });
    }

    const project = getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

    let installOutput = '';
    try {
      const result = await execAsync(installCmd, { cwd: project.path, timeout: 120000 });
      installOutput = (result.stdout || '') + (result.stderr || '');
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      installOutput = (e.stdout || '') + (e.stderr || '');
    }

    invalidateProjectCache(id);

    return NextResponse.json({ success: true, removed: pkgName, output: installOutput });
  } catch (error) {
    console.error('Error removing override:', error);
    return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 });
  }
}
