import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { updateException, type ExceptionClassification } from '@/lib/security/exceptions';
import { AUTO_APPLY_ENABLED } from '@/lib/auto-apply-flag';
import { logger } from '@/lib/logger';

const VALID_CLASSIFICATIONS: ExceptionClassification[] = [
  'risk-accepted',
  'false-positive',
  'compensating-control',
  'deferred',
  'unfixable',
  'deviation',
];

interface PatchBody {
  classification?: ExceptionClassification;
  reason?: string;
  notes?: string | null;       // null = clear
  expiresAt?: string | null;   // null = clear
}

export async function PATCH(
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

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  if (body.classification && !VALID_CLASSIFICATIONS.includes(body.classification)) {
    return NextResponse.json({ error: 'Invalid classification' }, { status: 400 });
  }
  if (body.reason !== undefined && typeof body.reason !== 'string') {
    return NextResponse.json({ error: 'reason must be a string' }, { status: 400 });
  }

  // Translate nulls to undefined for storage layer
  const updates: Parameters<typeof updateException>[0]['updates'] = {};
  if (body.classification !== undefined) updates.classification = body.classification;
  if (body.reason !== undefined) updates.reason = body.reason;
  if ('notes' in body) updates.notes = body.notes ?? undefined;
  if ('expiresAt' in body) updates.expiresAt = body.expiresAt ?? undefined;

  const exc = updateException({ projectId: id, exceptionId, updates });
  if (!exc) return NextResponse.json({ error: 'Exception not found' }, { status: 404 });

  logger.info(
    'security',
    'exception_modified',
    `Exception ${exc.id} modified`,
    {
      projectId: id,
      meta: { exceptionId: exc.id, parentPackage: exc.parentPackage, changes: Object.keys(updates) },
    },
  );

  return NextResponse.json({ success: true, exception: exc });
}
