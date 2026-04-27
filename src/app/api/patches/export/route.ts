import { NextRequest, NextResponse } from 'next/server';
import { readPatchHistory } from '@/lib/patch-storage';
import { getProjects } from '@/lib/config';

const MAX_LIMIT = 10000;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId') ?? undefined;
    const format = searchParams.get('format') ?? 'json';
    const rawLimit = parseInt(searchParams.get('limit') || '10000', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? MAX_LIMIT : rawLimit, 1), MAX_LIMIT);

    const projects = getProjects();
    const projectNames: Record<string, string> = {};
    for (const p of projects) projectNames[p.id] = p.name;

    const history = readPatchHistory();
    let updates = history.updates;
    if (projectId) updates = updates.filter((u) => u.projectId === projectId);
    updates = updates.slice(0, limit);

    const enriched = updates.map((u) => ({
      ...u,
      projectName: projectNames[u.projectId] || u.projectId,
    }));

    const date = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const headers = ['timestamp', 'projectId', 'projectName', 'package', 'fromVersion', 'toVersion', 'trigger', 'status'];
      const rows = [
        headers.join(','),
        ...enriched.map((u) =>
          headers.map((h) => {
            const val = (u as Record<string, unknown>)[h];
            const str = val == null ? '' : String(val);
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          }).join(',')
        ),
      ];
      return new NextResponse(rows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="patch-history-${date}.csv"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(enriched, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="patch-history-${date}.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting patch history:', error);
    return NextResponse.json({ error: 'Failed to export patch history' }, { status: 500 });
  }
}
