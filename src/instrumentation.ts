export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScanScheduler } = await import('./lib/scan-scheduler');
    startScanScheduler();
  }
}
