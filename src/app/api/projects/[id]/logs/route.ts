import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { getLogs } from '@/lib/process-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const download = request.nextUrl.searchParams.get('download');
    const format = request.nextUrl.searchParams.get('format') ?? 'json';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '1000', 10);
    const logs = getLogs(id, Math.min(limit, 5000));

    if (download || format === 'text') {
      const text = logs
        .map((e) => `${e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp} [${e.type === 'stderr' ? 'ERR' : 'OUT'}] ${e.message}`)
        .join('\n');
      const filename = `${project.name.replace(/\s+/g, '-')}-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ projectId: id, logs });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
