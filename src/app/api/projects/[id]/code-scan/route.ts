import { NextResponse } from 'next/server';
import { getProjects } from '@/lib/config';
import { scanProjectCode } from '@/lib/code-scanner';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projects = getProjects();
  const project = projects.find(p => p.id === id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  try {
    const result = await scanProjectCode(project.path, project.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
