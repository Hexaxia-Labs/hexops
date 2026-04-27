import { NextResponse } from 'next/server';
import { getProjects } from '@/lib/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface DepEntry {
  name: string;
  projects: Array<{ id: string; name: string; version: string; isDev: boolean }>;
  count: number;
}

export async function GET() {
  const projects = getProjects();

  const depMap: Record<string, DepEntry> = {};

  for (const project of projects) {
    const pkgPath = join(project.path, 'package.json');
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps: Record<string, string> = pkg.dependencies || {};
      const devDeps: Record<string, string> = pkg.devDependencies || {};

      for (const [name, version] of Object.entries(deps)) {
        if (!depMap[name]) depMap[name] = { name, projects: [], count: 0 };
        depMap[name].projects.push({ id: project.id, name: project.name, version, isDev: false });
        depMap[name].count++;
      }
      for (const [name, version] of Object.entries(devDeps)) {
        if (!depMap[name]) depMap[name] = { name, projects: [], count: 0 };
        depMap[name].projects.push({ id: project.id, name: project.name, version, isDev: true });
        depMap[name].count++;
      }
    } catch { /* skip */ }
  }

  // Sort by usage count descending, return top 100 most shared
  const sorted = Object.values(depMap)
    .filter(d => d.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  // Mark packages that appear in patch queue (have known vulnerabilities)
  const { readProjectCache } = await import('@/lib/patch-storage');
  const vulnerablePackages = new Set<string>();
  for (const project of projects) {
    try {
      const cache = readProjectCache(project.id);
      for (const vuln of cache?.vulnerabilities ?? []) {
        vulnerablePackages.add((vuln as { name: string }).name);
      }
    } catch { /* skip */ }
  }

  const withVulnFlag = sorted.map(d => ({
    ...d,
    isVulnerable: vulnerablePackages.has(d.name),
  }));

  return NextResponse.json({
    shared: withVulnFlag,
    totalProjects: projects.length,
    totalSharedDeps: sorted.length,
  });
}
