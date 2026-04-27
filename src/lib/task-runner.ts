import { getGlobalSettings, updateGlobalSettings } from './settings';
import { getProjects } from './config';
import { scanProject } from './patch-scanner';
import { logger } from './logger';
import { addNotification } from './notifications';
import { isTracked } from './process-manager';
import type { SchedulerTask } from './types';

const INTERVAL_MS: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const taskTimers = new Map<string, ReturnType<typeof setInterval>>();

async function runPatchScan(task: SchedulerTask): Promise<{ success: boolean; output: string }> {
  const projects = getProjects();
  let scanned = 0;
  for (const project of projects) {
    try {
      await scanProject(project, true);
      scanned++;
    } catch (err) {
      logger.error('scheduler', 'task_failed', `Scan failed for ${project.id}`, {
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return { success: true, output: `Scanned ${scanned}/${projects.length} projects` };
}

async function runHealthCheck(_task: SchedulerTask): Promise<{ success: boolean; output: string }> {
  const projects = getProjects();
  const results: string[] = [];
  for (const project of projects) {
    if (!isTracked(project.id)) continue;
    try {
      const res = await fetch(`http://localhost:${project.port ?? 3000}`, {
        signal: AbortSignal.timeout(3000),
      });
      results.push(`${project.name}: ${res.status}`);
    } catch {
      results.push(`${project.name}: unreachable`);
      addNotification({
        severity: 'warning',
        category: 'application',
        title: `${project.name} health check failed`,
        message: `Project on port ${project.port ?? 3000} is not responding`,
        projectId: project.id,
        actionUrl: '/',
      });
    }
  }
  return { success: true, output: results.join(', ') || 'No running projects' };
}

async function executeTask(task: SchedulerTask) {
  logger.info('scheduler', 'task_started', `Running task: ${task.name}`, { meta: { taskId: task.id } });
  const start = Date.now();
  let result: { success: boolean; output: string };

  try {
    if (task.action === 'patch-scan') {
      result = await runPatchScan(task);
    } else if (task.action === 'health-check') {
      result = await runHealthCheck(task);
    } else {
      result = { success: false, output: `Unknown action: ${task.action}` };
    }
  } catch (err) {
    result = { success: false, output: err instanceof Error ? err.message : String(err) };
  }

  const duration = Date.now() - start;
  logger.info('scheduler', result.success ? 'task_completed' : 'task_failed',
    `Task ${task.name} ${result.success ? 'completed' : 'failed'} in ${duration}ms`, {
      meta: { taskId: task.id, duration, output: result.output.slice(0, 200) },
    });

  // Persist last run info back to settings
  try {
    const settings = getGlobalSettings();
    const tasks = settings.scheduler?.tasks ?? [];
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      tasks[idx] = {
        ...tasks[idx],
        lastRun: new Date().toISOString(),
        lastStatus: result.success ? 'success' : 'failure',
        lastOutput: result.output.slice(0, 500),
      };
      updateGlobalSettings({ scheduler: { tasks } });
    }
  } catch { /* non-fatal */ }
}

export function startTaskRunner() {
  const settings = getGlobalSettings();
  const tasks = settings.scheduler?.tasks ?? [];

  for (const task of tasks) {
    scheduleTask(task);
  }

  logger.info('system', 'task_runner:start', `Task runner started — ${tasks.filter(t => t.enabled).length} tasks active`);
}

export function scheduleTask(task: SchedulerTask) {
  // Clear existing timer
  if (taskTimers.has(task.id)) {
    clearInterval(taskTimers.get(task.id)!);
    taskTimers.delete(task.id);
  }

  if (!task.enabled) return;

  const ms = INTERVAL_MS[task.interval];
  if (!ms) return;

  const timer = setInterval(() => {
    executeTask(task).catch(() => {});
  }, ms);

  taskTimers.set(task.id, timer);
}

export function stopTaskRunner() {
  for (const timer of taskTimers.values()) clearInterval(timer);
  taskTimers.clear();
}

export async function triggerTask(taskId: string): Promise<{ success: boolean; output: string }> {
  const settings = getGlobalSettings();
  const task = settings.scheduler?.tasks?.find(t => t.id === taskId);
  if (!task) return { success: false, output: 'Task not found' };
  return executeTask(task).then(() => ({ success: true, output: 'Task triggered' }));
}
