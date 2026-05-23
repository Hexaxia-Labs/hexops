import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/lib/logger';

const execFileAsync = promisify(execFile);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const source = typeof body.source === 'string' ? body.source : undefined;
  const advisories = Array.isArray(body.advisories)
    ? (body.advisories as unknown[]).filter((a): a is string => typeof a === 'string')
    : undefined;

  try {
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const cwd = project.path;

    // Execute git push — if rejected (non-fast-forward), pull --rebase and retry once
    let pushOut: { stdout: string; stderr: string };
    try {
      pushOut = await execFileAsync('git', ['push'], { cwd, timeout: 60000 });
    } catch (pushErr) {
      const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      if (!msg.includes('non-fast-forward') && !msg.includes('rejected')) {
        throw pushErr;
      }

      // Remote has commits we don't have (e.g. Dependabot merged between our commit and push).
      // Rebase our patch commit on top of whatever landed remotely, then push again.
      logger.info('git', 'push_rebase', 'Push rejected (non-fast-forward) — pulling with rebase', {
        projectId: id,
        meta: { ...(source ? { source } : {}), ...(advisories ? { advisories } : {}) },
      });
      try {
        await execFileAsync('git', ['pull', '--rebase', '--autostash'], { cwd, timeout: 60000 });
      } catch (pullErr) {
        const pullMsg = pullErr instanceof Error ? pullErr.message : String(pullErr);
        throw new Error(`Push rejected and rebase failed (likely conflict) — resolve manually: ${pullMsg}`);
      }

      pushOut = await execFileAsync('git', ['push'], { cwd, timeout: 60000 });
    }

    // Log success
    logger.info('git', 'push_completed', 'Pushed changes to remote', {
      projectId: id,
      meta: { ...(source ? { source } : {}), ...(advisories ? { advisories } : {}) },
    });

    return NextResponse.json({
      success: true,
      output: pushOut.stdout || pushOut.stderr || 'Push completed',
    });
  } catch (error) {
    console.error('Git push failed:', error);
    const stderr = error && typeof error === 'object' && 'stderr' in error ? (error as { stderr?: string }).stderr?.trim() : ''
    const errorMessage = stderr || (error instanceof Error ? error.message : 'Git push failed');

    // Log failure
    logger.error('git', 'push_failed', `Push failed: ${errorMessage}`, {
      projectId: id,
      meta: {
        error: errorMessage,
        ...(source ? { source } : {}),
        ...(advisories ? { advisories } : {}),
      },
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
