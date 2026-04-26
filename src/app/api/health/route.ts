import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

// Captured once at module load — changes on every server restart.
// Compare this value before/after a restart to confirm new code is live.
const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_STARTED_MS = Date.now();

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

const GIT_HASH = getGitHash();

export async function GET() {
  return NextResponse.json({
    ok: true,
    startedAt: SERVER_STARTED_AT,
    uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_MS) / 1000),
    gitHash: GIT_HASH,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });
}
