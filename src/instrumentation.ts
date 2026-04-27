export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScanScheduler } = await import('./lib/scan-scheduler');
    startScanScheduler();
    const { startTaskRunner } = await import('./lib/task-runner');
    startTaskRunner();
  }
}
