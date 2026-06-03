import { NextRequest, NextResponse } from 'next/server';
import { getProjects, getCategories, saveConfig } from '@/lib/config';
import { getPlugin } from '@/lib/security/plugins';
import { setProjectPluginConfig } from '@/lib/security/plugins/config';
import { AUTO_APPLY_ENABLED } from '@/lib/auto-apply-flag';

interface ToggleRequest {
  enabled: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pluginId: string }> }
) {
  if (!AUTO_APPLY_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Auto-apply is disabled in HexOps. Re-enable AUTO_APPLY_ENABLED to apply updates.' },
      { status: 409 },
    );
  }

  const { id, pluginId } = await params;

  const plugin = getPlugin(pluginId);
  if (!plugin) {
    return NextResponse.json({ error: `Unknown plugin: ${pluginId}` }, { status: 404 });
  }

  const projects = getProjects();
  const projectIndex = projects.findIndex(p => p.id === id);
  if (projectIndex === -1) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as ToggleRequest | null;
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Body must be { enabled: boolean }' }, { status: 400 });
  }

  // Mutate via the existing setProjectPluginConfig helper (T3). Writer captures
  // the index update + saves the whole config (mirrors the holds-route pattern).
  await setProjectPluginConfig(
    projects[projectIndex],
    pluginId,
    { enabled: body.enabled },
    (next) => {
      projects[projectIndex] = next;
      saveConfig({ projects, categories: getCategories() });
    },
  );

  return NextResponse.json({
    success: true,
    project: id,
    pluginId,
    enabled: body.enabled,
  });
}
