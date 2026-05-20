import { NextResponse } from 'next/server';
import { getProjects } from '@/lib/config';
import { readSecurityCache } from '@/lib/security/persistence';

export async function GET() {
  const projects = getProjects();
  const perProject = projects.map((p) => {
    const cached = readSecurityCache(p.id);
    return {
      projectId: p.id,
      projectName: p.name,
      timestamp: cached?.timestamp ?? null,
      sources: cached?.sources ?? {},
      findings: cached?.findings ?? [],
    };
  });
  return NextResponse.json({ projects: perProject });
}
