import { NextRequest, NextResponse } from 'next/server';
import { readPatchHistory } from '@/lib/patch-storage';
import { getProjects } from '@/lib/config';

// Returns weekly bucketed patch activity and computed KPIs for the trends dashboard.
export async function GET(request: NextRequest) {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId') || undefined;

    const history = readPatchHistory();
    let updates = history.updates;
    if (projectId) updates = updates.filter(u => u.projectId === projectId);

    if (updates.length === 0) {
      return NextResponse.json({ weeks: [], kpis: { totalPatches: 0, successRate: 0, avgPerWeek: 0, mttrDays: null } });
    }

    // Build weekly buckets (ISO week: Mon–Sun)
    const bucket = (ts: string): string => {
      const d = new Date(ts);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      return monday.toISOString().slice(0, 10);
    };

    const weekMap: Record<string, { week: string; success: number; failure: number; packages: Set<string> }> = {};
    for (const u of updates) {
      const w = bucket(u.timestamp);
      if (!weekMap[w]) weekMap[w] = { week: w, success: 0, failure: 0, packages: new Set() };
      if (u.success) weekMap[w].success++;
      else weekMap[w].failure++;
      weekMap[w].packages.add(u.package);
    }

    const weeks = Object.values(weekMap)
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-26) // last 26 weeks
      .map(({ week, success, failure, packages }) => ({
        week,
        success,
        failure,
        total: success + failure,
        uniquePackages: packages.size,
      }));

    // KPIs
    const totalPatches = updates.length;
    const successCount = updates.filter(u => u.success).length;
    const successRate = totalPatches > 0 ? Math.round((successCount / totalPatches) * 100) : 0;
    const avgPerWeek = weeks.length > 0 ? Math.round((totalPatches / weeks.length) * 10) / 10 : 0;

    // Per-project breakdown
    const projects = getProjects();
    const projectNames: Record<string, string> = {};
    for (const p of projects) projectNames[p.id] = p.name;

    const byProject: Record<string, { name: string; total: number; success: number }> = {};
    for (const u of updates) {
      if (!byProject[u.projectId]) {
        byProject[u.projectId] = { name: projectNames[u.projectId] || u.projectId, total: 0, success: 0 };
      }
      byProject[u.projectId].total++;
      if (u.success) byProject[u.projectId].success++;
    }

    const projectBreakdown = Object.entries(byProject)
      .map(([id, v]) => ({ id, ...v, successRate: Math.round((v.success / v.total) * 100) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return NextResponse.json({
      weeks,
      kpis: { totalPatches, successRate, avgPerWeek },
      projectBreakdown,
    });
  } catch (err) {
    console.error('Error computing patch trends:', err);
    return NextResponse.json({ error: 'Failed to compute trends' }, { status: 500 });
  }
}
