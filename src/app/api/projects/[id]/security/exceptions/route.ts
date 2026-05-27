import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { listExceptions, createException, type ExceptionClassification } from '@/lib/security/exceptions';
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

interface CreateBody {
  parentPackage: string;
  classification: ExceptionClassification;
  reason: string;
  notes?: string;
  expiresAt?: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  return NextResponse.json({ exceptions: listExceptions(id) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!AUTO_APPLY_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Auto-apply is disabled in HexOps.' },
      { status: 409 },
    );
  }
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (
    !body ||
    typeof body.parentPackage !== 'string' ||
    typeof body.reason !== 'string' ||
    !VALID_CLASSIFICATIONS.includes(body.classification)
  ) {
    return NextResponse.json(
      { error: 'Body must include parentPackage, reason, and a valid classification.' },
      { status: 400 },
    );
  }

  const exc = createException({
    projectId: id,
    parentPackage: body.parentPackage,
    classification: body.classification,
    reason: body.reason,
    notes: body.notes,
    expiresAt: body.expiresAt,
  });

  logger.info(
    'security',
    'exception_filed',
    `Exception ${exc.id} filed for ${exc.parentPackage}`,
    {
      projectId: id,
      meta: {
        exceptionId: exc.id,
        parentPackage: exc.parentPackage,
        classification: exc.classification,
        expiresAt: exc.expiresAt,
      },
    },
  );

  return NextResponse.json({ success: true, exception: exc });
}
