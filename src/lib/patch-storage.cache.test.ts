import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readProjectCache,
  writeProjectCache,
  createProjectCache,
  invalidateProjectCache,
} from './patch-storage';

/**
 * The patch scan cache must reflect OUT-OF-BAND dependency changes (manual edits,
 * CLI bumps, dependabot, git pull) — not just its own apply-patch endpoints — so a
 * project patched outside hexops shows up immediately instead of after the TTL.
 */
describe('patch cache content-aware invalidation', () => {
  const ids: string[] = [];
  const dirs: string[] = [];

  afterEach(() => {
    for (const id of ids) invalidateProjectCache(id);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    ids.length = 0;
    dirs.length = 0;
  });

  function makeProject(deps: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'hexops-cache-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: deps }));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }));
    return dir;
  }

  it('serves the cache while package.json/lockfile are unchanged', () => {
    const id = `test-cache-unchanged-${Date.now()}`;
    ids.push(id);
    const dir = makeProject({ uuid: '^14.0.0' });
    writeProjectCache(createProjectCache(id, [], [], undefined, dir));
    expect(readProjectCache(id, dir)).not.toBeNull();
  });

  it('invalidates the cache when package.json deps change out of band', () => {
    const id = `test-cache-changed-${Date.now()}`;
    ids.push(id);
    const dir = makeProject({ uuid: '^14.0.0' });
    writeProjectCache(createProjectCache(id, [], [], undefined, dir));
    expect(readProjectCache(id, dir)).not.toBeNull();

    // simulate an out-of-band patch (e.g. CLI bump / dependabot)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { uuid: '^14.0.1' } }));
    expect(readProjectCache(id, dir)).toBeNull();
  });
});
