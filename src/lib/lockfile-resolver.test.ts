// biome-ignore-all lint/suspicious/noTemplateCurlyInString: .npmrc fixtures contain literal ${VAR} placeholders — that is the thing under test
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

vi.mock('./patch-scanner', () => ({
  detectPackageManager: () => 'pnpm',
  getDetectionSource: () => 'lockfile',
}));

vi.mock('./lockfile-checker', () => ({
  checkLockFileFreshness: () => ({ mismatches: [] }),
}));

import { resolveLockfile } from './lockfile-resolver';

let dir: string;
const LOCK = 'pnpm-lock.yaml';
const ORIGINAL = 'lockfileVersion: 9.0\n# original contents\n';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hexops-resolver-'));
  writeFileSync(join(dir, LOCK), ORIGINAL);
  mockExecSync.mockReset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('clean-slate', () => {
  it('deletes the lock file and installs when the install succeeds', async () => {
    mockExecSync.mockImplementation(() => Buffer.from(''));

    const result = await resolveLockfile(dir, 'clean-slate');

    expect(result.success).toBe(true);
    expect(mockExecSync).toHaveBeenCalledOnce();
    expect(result.actions.join('\n')).toContain('Fresh install completed');
  });

  it('restores the lock file when the install fails (#143)', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('ERR_PNPM_FETCH_404 GET https://registry.npmjs.org/@do868%2Fshared: Not Found');
    });

    const result = await resolveLockfile(dir, 'clean-slate');

    expect(result.success).toBe(false);
    // The critical assertion: a failed remediation must not consume the lockfile.
    expect(existsSync(join(dir, LOCK))).toBe(true);
    expect(readFileSync(join(dir, LOCK), 'utf-8')).toBe(ORIGINAL);
    expect(result.actions.join('\n')).toContain(`Restored ${LOCK}`);
  });

  it('surfaces the package manager error in actions, not just a wrapper (#141)', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('ERR_PNPM_FETCH_404 Not Found');
    });

    const result = await resolveLockfile(dir, 'clean-slate');

    expect(result.actions.join('\n')).toContain('ERR_PNPM_FETCH_404');
    expect(result.error).toContain('ERR_PNPM_FETCH_404');
  });

  it('refuses to delete anything when .npmrc needs an unset variable (#143)', async () => {
    writeFileSync(join(dir, '.npmrc'), '//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}\n');

    const result = await resolveLockfile(dir, 'clean-slate', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('GITHUB_TOKEN');
    // Nothing was destroyed and no install was attempted.
    expect(existsSync(join(dir, LOCK))).toBe(true);
    expect(readFileSync(join(dir, LOCK), 'utf-8')).toBe(ORIGINAL);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('proceeds when the required variable is supplied via extraEnv (#142)', async () => {
    writeFileSync(join(dir, '.npmrc'), '//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}\n');
    mockExecSync.mockImplementation(() => Buffer.from(''));

    const result = await resolveLockfile(dir, 'clean-slate', { GITHUB_TOKEN: 'ghp_x' });

    expect(result.success).toBe(true);
    const opts = mockExecSync.mock.calls[0][1] as { env: NodeJS.ProcessEnv };
    expect(opts.env.GITHUB_TOKEN).toBe('ghp_x');
  });
});

describe('repair', () => {
  it('restores the lock file when regeneration also fails (#143)', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('install failed');
    });

    const result = await resolveLockfile(dir, 'repair');

    expect(result.success).toBe(false);
    expect(existsSync(join(dir, LOCK))).toBe(true);
    expect(readFileSync(join(dir, LOCK), 'utf-8')).toBe(ORIGINAL);
  });

  it('passes the project env to the install (#142)', async () => {
    mockExecSync.mockImplementation(() => Buffer.from(''));

    await resolveLockfile(dir, 'repair', { GITHUB_TOKEN: 'ghp_y' });

    const opts = mockExecSync.mock.calls[0][1] as { env: NodeJS.ProcessEnv };
    expect(opts.env.GITHUB_TOKEN).toBe('ghp_y');
  });
});

describe('preflight', () => {
  it('fails fast when .npmrc needs an unset variable (#142)', async () => {
    writeFileSync(join(dir, '.npmrc'), '_authToken=${GITHUB_TOKEN}\n');

    const result = await resolveLockfile(dir, 'preflight', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('GITHUB_TOKEN');
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('passes when the lock file installs cleanly', async () => {
    mockExecSync.mockImplementation(() => Buffer.from(''));

    const result = await resolveLockfile(dir, 'preflight', { GITHUB_TOKEN: 'ghp_z' });

    expect(result.success).toBe(true);
    expect(result.actions.join('\n')).toContain('Lock file is healthy');
  });
});
