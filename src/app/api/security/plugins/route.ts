import { NextResponse } from 'next/server';
import { SECURITY_PLUGINS } from '@/lib/security/plugins';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Host-availability only (no project context here — project-specific status
  // goes through /api/security/plugins/[id]/status?projectId=…).
  const entries = await Promise.all(
    SECURITY_PLUGINS.map(async (p) => {
      try {
        const host = await p.isAvailable();
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          kind: p.kind,
          detailRoute: p.detailRoute,
          host,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          kind: p.kind,
          detailRoute: p.detailRoute,
          host: { available: false, reason: `isAvailable threw: ${msg}` },
        };
      }
    }),
  );
  return NextResponse.json({ plugins: entries });
}
