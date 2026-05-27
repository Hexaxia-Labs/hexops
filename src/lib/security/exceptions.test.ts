import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createException,
  listExceptions,
  listActiveExceptions,
  revokeException,
  isExceptionActive,
  activeExceptionParentSet,
  _setExceptionsDirForTest,
} from './exceptions';

const TEST_PROJECT = '__test_exceptions__';
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'hexops-exceptions-'));
  _setExceptionsDirForTest(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const baseArgs = {
  projectId: TEST_PROJECT,
  parentPackage: 'esbuild',
  classification: 'risk-accepted' as const,
  reason: 'esbuild binary not exposed to network',
};

describe('createException', () => {
  it('creates an exception and persists it', () => {
    const exc = createException(baseArgs);
    expect(exc.id).toMatch(/^exc_[0-9a-f]{16}$/);
    expect(exc.projectId).toBe(TEST_PROJECT);
    expect(exc.parentPackage).toBe('esbuild');
    expect(exc.classification).toBe('risk-accepted');
    expect(exc.scope).toBe('parent-package');
    expect(exc.revokedAt).toBeUndefined();
  });

  it('round-trips through list', () => {
    const exc = createException(baseArgs);
    const list = listExceptions(TEST_PROJECT);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(exc.id);
  });

  it('stores multiple exceptions', () => {
    createException(baseArgs);
    createException({ ...baseArgs, parentPackage: 'webpack', reason: 'dev-only' });
    expect(listExceptions(TEST_PROJECT)).toHaveLength(2);
  });

  it('stores optional fields', () => {
    const exc = createException({
      ...baseArgs,
      notes: 'reviewed by security team',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(exc.notes).toBe('reviewed by security team');
    expect(exc.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('isExceptionActive', () => {
  it('active exception returns true', () => {
    const exc = createException(baseArgs);
    expect(isExceptionActive(exc)).toBe(true);
  });

  it('revoked exception returns false', () => {
    const exc = createException(baseArgs);
    const revoked = revokeException({ projectId: TEST_PROJECT, exceptionId: exc.id });
    expect(isExceptionActive(revoked!)).toBe(false);
  });

  it('expired exception returns false', () => {
    const exc = createException({ ...baseArgs, expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(isExceptionActive(exc)).toBe(false);
  });

  it('not-yet-expired exception returns true', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const exc = createException({ ...baseArgs, expiresAt: future });
    expect(isExceptionActive(exc)).toBe(true);
  });
});

describe('revokeException', () => {
  it('sets revokedAt and revokeReason', () => {
    const exc = createException(baseArgs);
    const revoked = revokeException({
      projectId: TEST_PROJECT,
      exceptionId: exc.id,
      revokeReason: 'fix available',
    });
    expect(revoked?.revokedAt).toBeTruthy();
    expect(revoked?.revokeReason).toBe('fix available');
  });

  it('is idempotent — second revoke returns the already-revoked exception unchanged', () => {
    const exc = createException(baseArgs);
    revokeException({ projectId: TEST_PROJECT, exceptionId: exc.id });
    const first = listExceptions(TEST_PROJECT)[0].revokedAt;
    revokeException({ projectId: TEST_PROJECT, exceptionId: exc.id });
    const second = listExceptions(TEST_PROJECT)[0].revokedAt;
    expect(first).toBe(second);
  });

  it('returns undefined for unknown exception id', () => {
    const result = revokeException({ projectId: TEST_PROJECT, exceptionId: 'exc_doesnotexist' });
    expect(result).toBeUndefined();
  });
});

describe('listActiveExceptions', () => {
  it('excludes revoked exceptions', () => {
    const exc = createException(baseArgs);
    revokeException({ projectId: TEST_PROJECT, exceptionId: exc.id });
    expect(listActiveExceptions(TEST_PROJECT)).toHaveLength(0);
  });

  it('excludes expired exceptions', () => {
    createException({ ...baseArgs, expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(listActiveExceptions(TEST_PROJECT)).toHaveLength(0);
  });

  it('includes non-expired, non-revoked exceptions', () => {
    createException(baseArgs);
    expect(listActiveExceptions(TEST_PROJECT)).toHaveLength(1);
  });
});

describe('activeExceptionParentSet', () => {
  it('returns empty set when no exceptions', () => {
    const set = activeExceptionParentSet(TEST_PROJECT);
    expect(set.size).toBe(0);
  });

  it('returns parent packages of active exceptions', () => {
    createException(baseArgs);
    createException({ ...baseArgs, parentPackage: 'webpack', reason: 'dev-only' });
    const set = activeExceptionParentSet(TEST_PROJECT);
    expect(set.has('esbuild')).toBe(true);
    expect(set.has('webpack')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('excludes revoked parents', () => {
    const exc = createException(baseArgs);
    revokeException({ projectId: TEST_PROJECT, exceptionId: exc.id });
    expect(activeExceptionParentSet(TEST_PROJECT).has('esbuild')).toBe(false);
  });

  it('returns empty set for unknown project', () => {
    expect(activeExceptionParentSet('__no_such_project__').size).toBe(0);
  });
});
