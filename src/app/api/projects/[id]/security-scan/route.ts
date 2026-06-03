import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { scanProject, scanProjectWithSources } from '@/lib/security/runner';
import { SOURCES } from '@/lib/security/sources';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get('sources');
    const subset = filter
      ? SOURCES.filter(s => filter.split(',').map(x => x.trim()).includes(s.id))
      : SOURCES;
    if (subset.length === 0) {
      return NextResponse.json({ error: `No sources matched: ${filter}` }, { status: 400 });
    }
    const result = subset.length === SOURCES.length
      ? await scanProject(project)
      : await scanProjectWithSources(project, subset);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Security scan failed';
    logger.error('api', 'on_demand_scan_failed', message, { projectId: id, meta: { error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
