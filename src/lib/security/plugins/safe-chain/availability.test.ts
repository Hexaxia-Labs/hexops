import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSafeChainAvailable, _resetCacheForTest } from './availability';

describe('isSafeChainAvailable', () => {
  beforeEach(() => _resetCacheForTest());

  it('returns available:true when probe finds the binary', async () => {
    const probe = vi.fn(async () => ({ found: true, version: '1.5.3' }));
    const out = await isSafeChainAvailable(probe);
    expect(out).toEqual({ available: true, version: '1.5.3' });
  });

  it('returns available:false with reason when probe finds nothing', async () => {
    const probe = vi.fn(async () => ({ found: false, reason: 'safe-chain not in PATH' }));
    const out = await isSafeChainAvailable(probe);
    expect(out).toMatchObject({ available: false, reason: expect.stringContaining('PATH') });
    expect(out.available === false && out.installHint).toMatch(/github\.com\/AikidoSec/);
  });

  it('caches the probe result for 30s', async () => {
    const probe = vi.fn(async () => ({ found: true }));
    await isSafeChainAvailable(probe);
    await isSafeChainAvailable(probe);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
