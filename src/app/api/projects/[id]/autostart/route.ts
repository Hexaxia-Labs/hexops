import { NextRequest, NextResponse } from 'next/server';
import { getProject, loadConfig, saveConfig } from '@/lib/config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : !project.autostart;

  const config = loadConfig();
  const idx = config.projects.findIndex(p => p.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Project not found in config' }, { status: 404 });

  config.projects[idx] = { ...config.projects[idx], autostart: enabled };
  saveConfig(config);

  return NextResponse.json({ success: true, autostart: enabled });
}
