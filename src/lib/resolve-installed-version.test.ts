import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveInstalledVersion } from './patch-scanner';

let tmpDir: string;

function setup(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'hexops-resolve-version-'));
  return tmpDir;
}

function writePkgJson(dir: string, ...pathParts: string[]): void {
  const version = pathParts[pathParts.length - 1];
  const pkgDir = join(dir, ...pathParts.slice(0, -1));
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version }));
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveInstalledVersion', () => {
  it('prefers the nested path flagged by npm audit nodes over top-level', () => {
    const dir = setup();
    // Top-level (patched) version
    writePkgJson(dir, 'node_modules', 'postcss', '8.5.15');
    // Nested vulnerable version (what npm audit actually flagged)
    writePkgJson(dir, 'node_modules', 'next', 'node_modules', 'postcss', '8.4.31');

    const result = resolveInstalledVersion(dir, 'postcss', ['node_modules/next/node_modules/postcss']);
    expect(result).toBe('8.4.31');
  });

  it('falls back to top-level node_modules when nodes is undefined', () => {
    const dir = setup();
    writePkgJson(dir, 'node_modules', 'postcss', '8.5.15');

    const result = resolveInstalledVersion(dir, 'postcss', undefined);
    expect(result).toBe('8.5.15');
  });

  it('falls back to top-level node_modules when nodes is empty array', () => {
    const dir = setup();
    writePkgJson(dir, 'node_modules', 'postcss', '8.5.15');

    const result = resolveInstalledVersion(dir, 'postcss', []);
    expect(result).toBe('8.5.15');
  });

  it('returns undefined when nothing exists on disk', () => {
    const dir = setup();
    // No package.json files created

    const result = resolveInstalledVersion(dir, 'postcss', undefined);
    expect(result).toBeUndefined();
  });

  it('falls back to top-level when nodes path does not exist on disk', () => {
    const dir = setup();
    // Only top-level exists; the nodes path is missing
    writePkgJson(dir, 'node_modules', 'postcss', '8.5.15');

    const result = resolveInstalledVersion(dir, 'postcss', ['node_modules/gone/node_modules/postcss']);
    expect(result).toBe('8.5.15');
  });
});
