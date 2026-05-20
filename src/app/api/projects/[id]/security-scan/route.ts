import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { scanProject } from '@/lib/security/runner';
import { logger } from '@/lib/logger';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  try {
    const result = await scanProject(project);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Security scan failed';
    logger.error('api', 'on_demand_scan_failed', message, { projectId: id, meta: { error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
