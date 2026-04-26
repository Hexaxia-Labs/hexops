import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/lib/logger';

const execFileAsync = promisify(execFile);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
      logger.info('git', 'push_rebase', 'Push rejected (non-fast-forward) — pulling with rebase', { projectId: id });
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
    });

    return NextResponse.json({
      success: true,
      output: pushOut.stdout || pushOut.stderr || 'Push completed',
    });
  } catch (error) {
    console.error('Git push failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Git push failed';

    // Log failure
    logger.error('git', 'push_failed', `Push failed: ${errorMessage}`, {
      projectId: id,
      meta: { error: errorMessage },
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
