import { getProjects } from './config';
import { getGlobalSettings } from './settings';
import { scanProject } from './patch-scanner';
import { readPatchState, writePatchState } from './patch-storage';
import { logger } from './logger';
import { addNotification } from './notifications';

const INTERVALS_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function runScan() {
  if (running) return;
  running = true;
  try {
    const projects = getProjects();
    logger.info('system', 'scheduled_scan:start', `Background scan starting — ${projects.length} projects`);
    let scanned = 0;
    for (const project of projects) {
      try {
        const cache = await scanProject(project, true);
        scanned++;
        if (cache) {
          const criticals = (cache.vulnerabilities ?? []).filter(
            (v: { severity: string }) => v.severity === 'critical' || v.severity === 'high'
          );
          if (criticals.length > 0) {
            addNotification({
              severity: criticals.some((v: { severity: string }) => v.severity === 'critical') ? 'critical' : 'error',
              category: 'security',
              title: `${criticals.length} critical/high vulnerabilit${criticals.length === 1 ? 'y' : 'ies'} in ${project.name}`,
              message: criticals.map((v: { name: string; severity: string }) => `${v.name} (${v.severity})`).slice(0, 5).join(', '),
              projectId: project.id,
              actionUrl: '/patches',
            });
          }
        }
      } catch (err) {
        logger.error('system', 'scheduled_scan:project_error', `Failed to scan ${project.id}`, {
          meta: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    const state = readPatchState();
    state.lastFullScan = new Date().toISOString();
    writePatchState(state);
    logger.info('system', 'scheduled_scan:complete', `Background scan complete — ${scanned}/${projects.length} succeeded`);
  } finally {
    running = false;
  }
}

export function startScanScheduler() {
  const settings = getGlobalSettings();
  const interval = settings.patching?.scanInterval ?? 'manual';

  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (interval === 'manual') return;

  const ms = INTERVALS_MS[interval];
  if (!ms) return;

  logger.info('system', 'scheduler:start', `Background scan scheduled every ${interval}`);
  schedulerTimer = setInterval(() => { runScan().catch(() => {}); }, ms);
}

export function stopScanScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
