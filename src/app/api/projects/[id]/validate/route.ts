import { NextRequest } from 'next/server';
import { getProject } from '@/lib/config';
import { validatePatches, type ValidationPackage } from '@/lib/patch-validator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);

  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.packages) || body.packages.length === 0) {
    return new Response(JSON.stringify({ error: 'packages array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const packages = body.packages as ValidationPackage[];
  const abortController = new AbortController();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      request.signal.addEventListener('abort', () => abortController.abort());

      try {
        const result = await validatePatches(
          project.path,
          id,
          packages,
          project.scripts.build,
          (progress) => send('progress', progress),
          abortController.signal,
        );
        send('complete', result);
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
