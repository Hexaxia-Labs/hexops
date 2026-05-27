import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/config';
import { logger } from '@/lib/logger';

interface CompleteBody {
  outcome: {
    status: 'resolved' | 'partial' | 'unresolved' | 'error';
    previousFindingCount: number;
    currentFindingCount: number;
    findingsCovered?: string[];     // dedupKeys that were targeted
    findingsResolved?: string[];    // dedupKeys that disappeared post-verify
    findingsRemaining?: string[];   // dedupKeys still present post-verify
    error?: string;                 // when status === 'error'
  };
  source?: string;                  // for thread-back to the original attempt's source (grype, cve-lite)
}

// No AUTO_APPLY_ENABLED gate — this is an audit-log entry, not a mutation
// that touches code/state (same principle as exception endpoints).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const { id, attemptId } = await params;
  if (!getProject(id)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as CompleteBody | null;
  if (!body || !body.outcome || typeof body.outcome.status !== 'string') {
    return NextResponse.json({ error: 'Body must include outcome.status' }, { status: 400 });
  }

  const validStatus = ['resolved', 'partial', 'unresolved', 'error'];
  if (!validStatus.includes(body.outcome.status)) {
    return NextResponse.json(
      { error: `outcome.status must be one of ${validStatus.join(', ')}` },
      { status: 400 },
    );
  }

  logger.info('security', 'remediation_completed', `Apply attempt ${attemptId} completed: ${body.outcome.status}`, {
    projectId: id,
    meta: {
      attemptId,
      source: body.source,
      outcome: body.outcome,
    },
  });

  return NextResponse.json({ success: true });
}
