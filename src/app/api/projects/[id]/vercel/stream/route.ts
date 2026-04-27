import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { spawn } from 'child_process';

// POST — trigger a deploy and stream build logs as SSE
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const production = body.production === true;

  const args = production ? ['--prod', '--yes'] : ['--yes'];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const child = spawn('vercel', args, {
        cwd: project.path,
        env: { ...process.env },
      });

      child.stdout.on('data', (chunk: Buffer) => {
        send('log', { text: chunk.toString() });
      });

      child.stderr.on('data', (chunk: Buffer) => {
        send('log', { text: chunk.toString(), isError: true });
      });

      child.on('close', (code) => {
        send('done', { exitCode: code, success: code === 0 });
        controller.close();
      });

      child.on('error', (err) => {
        send('error', { message: err.message });
        controller.close();
      });

      // Abort when client disconnects
      request.signal.addEventListener('abort', () => {
        child.kill('SIGTERM');
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
