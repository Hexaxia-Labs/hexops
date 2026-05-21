import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('returns results in input order despite out-of-order completion', async () => {
    // item 0 finishes last, item 1 finishes first
    const delays = [30, 10, 20];
    const results = await mapWithConcurrency(
      delays,
      3,
      (ms) => new Promise<number>(res => setTimeout(() => res(ms), ms)),
    );
    expect(results).toEqual([30, 10, 20]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise(res => setTimeout(res, 5));
      inFlight--;
    });

    expect(peakInFlight).toBeLessThanOrEqual(3);
    expect(peakInFlight).toBeGreaterThanOrEqual(2); // actually ran concurrently
  });

  it('calls onSettled exactly once per item with the correct index and result', async () => {
    const settled: Array<{ index: number; result: string }> = [];
    const items = ['a', 'b', 'c'];

    await mapWithConcurrency(
      items,
      2,
      async (item) => item.toUpperCase(),
      (index, result) => settled.push({ index, result }),
    );

    expect(settled).toHaveLength(3);
    // Each index appears exactly once
    expect(settled.map(s => s.index).sort()).toEqual([0, 1, 2]);
    // Results match
    const byIndex = Object.fromEntries(settled.map(s => [s.index, s.result]));
    expect(byIndex).toEqual({ 0: 'A', 1: 'B', 2: 'C' });
  });

  it('rejects with the task error if a task throws', async () => {
    const boom = new Error('boom');
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw boom;
        return n;
      }),
    ).rejects.toBe(boom);
  });

  it('handles an empty items array', async () => {
    const results = await mapWithConcurrency([], 5, async (x: number) => x);
    expect(results).toEqual([]);
  });
});
