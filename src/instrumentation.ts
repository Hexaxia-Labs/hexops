export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScanScheduler } = await import('./lib/scan-scheduler');
    startScanScheduler();
    const { startTaskRunner } = await import('./lib/task-runner');
    startTaskRunner();
    // Autostart projects flagged with autostart: true
    const { getProjects } = await import('./lib/config');
    const { startProject } = await import('./lib/process-manager');
    const { logger } = await import('./lib/logger');
    const autoProjects = getProjects().filter(p => p.autostart);
    if (autoProjects.length > 0) {
      logger.info('system', 'autostart', `Autostarting ${autoProjects.length} project(s)`);
      for (let i = 0; i < autoProjects.length; i++) {
        const project = autoProjects[i];
        try {
          if (i > 0) await new Promise(r => setTimeout(r, 1000)); // stagger starts
          startProject(project, 'dev');
          logger.info('system', 'autostart', `Autostarted ${project.name}`);
        } catch (err) {
          logger.error('system', 'autostart', `Failed to autostart ${project.name}`, {
            meta: { error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    }
  }
}
