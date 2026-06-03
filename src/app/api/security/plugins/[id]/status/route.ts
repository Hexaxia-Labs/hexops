import { NextRequest, NextResponse } from 'next/server';
import { getPlugin } from '@/lib/security/plugins';
import { getProject } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId query param required' },
      { status: 400 }
    );
  }

  const plugin = getPlugin(id);
  if (!plugin) {
    return NextResponse.json(
      { error: `unknown plugin: ${id}` },
      { status: 404 }
    );
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json(
      { error: `unknown project: ${projectId}` },
      { status: 404 }
    );
  }

  let host;
  try {
    host = await plugin.isAvailable();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    host = { available: false, reason: `isAvailable threw: ${msg}` };
  }

  let card;
  try {
    card = await plugin.renderCard(project);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    card = { status: 'error', headline: 'plugin error', error: msg };
  }

  return NextResponse.json({ pluginId: plugin.id, projectId, host, card });
}
