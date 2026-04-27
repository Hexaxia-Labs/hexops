import { NextRequest, NextResponse } from 'next/server';
import { getGlobalSettings, updateGlobalSettings } from '@/lib/settings';
import { scheduleTask, triggerTask } from '@/lib/task-runner';
import type { SchedulerTask } from '@/lib/types';

export async function GET() {
  const settings = getGlobalSettings();
  const tasks = settings.scheduler?.tasks ?? [];

  const now = Date.now();
  const INTERVAL_MS: Record<string, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  };

  const enriched = tasks.map(t => ({
    ...t,
    nextRun: t.enabled && t.lastRun
      ? new Date(new Date(t.lastRun).getTime() + (INTERVAL_MS[t.interval] || 0)).toISOString()
      : null,
  }));

  return NextResponse.json({ tasks: enriched });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action, taskId, updates } = body as {
    action: 'toggle' | 'update' | 'trigger';
    taskId: string;
    updates?: Partial<SchedulerTask>;
  };

  const settings = getGlobalSettings();
  const tasks = settings.scheduler?.tasks ?? [];
  const idx = tasks.findIndex(t => t.id === taskId);

  if (action === 'trigger') {
    const result = await triggerTask(taskId);
    return NextResponse.json(result);
  }

  if (idx === -1) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  if (action === 'toggle') {
    tasks[idx] = { ...tasks[idx], enabled: !tasks[idx].enabled };
    updateGlobalSettings({ scheduler: { tasks } });
    scheduleTask(tasks[idx]);
    return NextResponse.json({ success: true, task: tasks[idx] });
  }

  if (action === 'update' && updates) {
    tasks[idx] = { ...tasks[idx], ...updates };
    updateGlobalSettings({ scheduler: { tasks } });
    scheduleTask(tasks[idx]);
    return NextResponse.json({ success: true, task: tasks[idx] });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
