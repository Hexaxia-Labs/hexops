import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// GET — list local and remote branches
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  try {
    const { stdout: currentOut } = await execAsync('git branch --show-current', { cwd: project.path });
    const { stdout: localOut } = await execAsync('git branch --format="%(refname:short)"', { cwd: project.path });
    const { stdout: remoteOut } = await execAsync(
      'git branch -r --format="%(refname:short)"', { cwd: project.path }
    ).catch(() => ({ stdout: '' }));

    const current = currentOut.trim();
    const local = localOut.split('\n').map((b) => b.trim()).filter(Boolean);
    const remote = remoteOut.split('\n').map((b) => b.trim()).filter(Boolean).filter((b) => !b.endsWith('/HEAD'));

    return NextResponse.json({ current, local, remote });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

// POST — switch to branch, or create + switch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { branch, create = false } = body as { branch?: string; create?: boolean };

  if (!branch || typeof branch !== 'string') {
    return NextResponse.json({ error: 'branch name required' }, { status: 400 });
  }

  // Reject branch names with dangerous characters
  if (!/^[a-zA-Z0-9._\-/]+$/.test(branch)) {
    return NextResponse.json({ error: 'invalid branch name' }, { status: 400 });
  }

  try {
    if (create) {
      await execAsync(`git checkout -b ${branch}`, { cwd: project.path, timeout: 15000 });
    } else {
      await execAsync(`git checkout ${branch}`, { cwd: project.path, timeout: 15000 });
    }
    const { stdout: newCurrent } = await execAsync('git branch --show-current', { cwd: project.path });
    return NextResponse.json({ success: true, current: newCurrent.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
