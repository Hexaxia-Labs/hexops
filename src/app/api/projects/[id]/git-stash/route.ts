import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// GET — list stashes
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  try {
    const { stdout } = await execAsync('git stash list --format="%gd|%s|%aI"', {
      cwd: project.path, timeout: 10000,
    }).catch(() => ({ stdout: '' }));

    const stashes = stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [ref, message, date] = line.split('|');
      return { ref, message, date };
    });

    return NextResponse.json({ stashes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

// POST — stash action: push, pop, apply, drop
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { action, message, ref } = body as {
    action: 'push' | 'pop' | 'apply' | 'drop';
    message?: string;
    ref?: string;
  };

  if (!['push', 'pop', 'apply', 'drop'].includes(action)) {
    return NextResponse.json({ error: 'action must be push|pop|apply|drop' }, { status: 400 });
  }

  // Validate ref if provided (only digits, dashes, and stash@{N} format)
  if (ref && !/^stash@\{\d+\}$/.test(ref)) {
    return NextResponse.json({ error: 'invalid stash ref' }, { status: 400 });
  }

  try {
    let cmd: string;
    if (action === 'push') {
      cmd = message ? `git stash push -m "${message.replace(/"/g, '\\"')}"` : 'git stash push';
    } else if (action === 'pop') {
      cmd = ref ? `git stash pop ${ref}` : 'git stash pop';
    } else if (action === 'apply') {
      cmd = ref ? `git stash apply ${ref}` : 'git stash apply';
    } else {
      cmd = ref ? `git stash drop ${ref}` : 'git stash drop';
    }

    const { stdout, stderr } = await execAsync(cmd, { cwd: project.path, timeout: 15000 });
    return NextResponse.json({ success: true, output: (stdout + stderr).trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
