import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { revokeException } from '@/lib/security/exceptions';
import { AUTO_APPLY_ENABLED } from '@/lib/auto-apply-flag';
import { logger } from '@/lib/logger';

interface RevokeBody {
  revokeReason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; exceptionId: string }> },
) {
  if (!AUTO_APPLY_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Auto-apply is disabled in HexOps.' },
      { status: 409 },
    );
  }
  const { id, exceptionId } = await params;
  if (!getProject(id)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as RevokeBody;
  const exc = revokeException({
    projectId: id,
    exceptionId,
    revokeReason: body.revokeReason,
  });
  if (!exc) return NextResponse.json({ error: 'Exception not found' }, { status: 404 });

  logger.info(
    'security',
    'exception_revoked',
    `Exception ${exc.id} revoked`,
    {
      projectId: id,
      meta: {
        exceptionId: exc.id,
        parentPackage: exc.parentPackage,
        revokeReason: body.revokeReason,
      },
    },
  );

  return NextResponse.json({ success: true, exception: exc });
}
