import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const execAsync = promisify(exec);

const SERVICE_NAME = 'hexops';
const SERVICE_PATH = join(process.env.HOME || '/root', '.config', 'systemd', 'user', `${SERVICE_NAME}.service`);

function buildServiceFile(): string {
  const cwd = process.cwd();
  const nodeExec = process.execPath;

  return `[Unit]
Description=HexOps development server manager
After=network.target

[Service]
Type=simple
WorkingDirectory=${cwd}
ExecStart=${nodeExec} node_modules/.bin/next start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=${process.env.PATH}

[Install]
WantedBy=default.target
`;
}

export async function GET() {
  // Check current status
  let enabled = false;
  let serviceFileExists = existsSync(SERVICE_PATH);

  if (serviceFileExists) {
    try {
      const { stdout } = await execAsync(`systemctl --user is-enabled ${SERVICE_NAME} 2>/dev/null || true`);
      enabled = stdout.trim() === 'enabled';
    } catch {
      enabled = false;
    }
  }

  return NextResponse.json({
    enabled,
    serviceFileExists,
    servicePath: SERVICE_PATH,
    serviceContent: serviceFileExists ? readFileSync(SERVICE_PATH, 'utf-8') : buildServiceFile(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action } = body as { action: 'enable' | 'disable' | 'generate' };

  if (action === 'generate') {
    try {
      mkdirSync(dirname(SERVICE_PATH), { recursive: true });
      writeFileSync(SERVICE_PATH, buildServiceFile(), 'utf-8');
      return NextResponse.json({ success: true, path: SERVICE_PATH });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
    }
  }

  if (action === 'enable') {
    try {
      mkdirSync(dirname(SERVICE_PATH), { recursive: true });
      writeFileSync(SERVICE_PATH, buildServiceFile(), 'utf-8');
      await execAsync(`systemctl --user daemon-reload && systemctl --user enable ${SERVICE_NAME}`, { timeout: 10000 });
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to enable' }, { status: 500 });
    }
  }

  if (action === 'disable') {
    try {
      await execAsync(`systemctl --user disable ${SERVICE_NAME}`, { timeout: 10000 });
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to disable' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
