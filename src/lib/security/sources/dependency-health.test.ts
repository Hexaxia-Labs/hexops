import { describe, it, expect } from 'vitest';
import { collectValueImports, rootPkg, stripComments } from './dependency-health';
import { detectPhantomDeps, type PhantomScanInput } from './dependency-health';

describe('rootPkg', () => {
  it('reduces scoped subpaths to scope/name', () => {
    expect(rootPkg('@scope/x/sub')).toBe('@scope/x');
    expect(rootPkg('@scope/x')).toBe('@scope/x');
    expect(rootPkg('next/navigation')).toBe('next');
    expect(rootPkg('pg')).toBe('pg');
  });
});

describe('stripComments', () => {
  it('removes block and line comments but keeps :// in strings', () => {
    expect(stripComments('a /* b */ c')).toBe('a  c');
    expect(stripComments('x // y')).toBe('x ');
    expect(stripComments("const u = 'https://h'")).toContain('https://h');
  });
});

describe('collectValueImports', () => {
  const get = (s: string) => Array.from(collectValueImports(s)).sort();

  it('includes static value imports and require', () => {
    expect(get("import yaml from 'js-yaml';")).toEqual(['js-yaml']);
    expect(get("import { visit } from 'unist-util-visit';")).toEqual(['unist-util-visit']);
    expect(get("import 'side-effect-pkg';")).toEqual(['side-effect-pkg']);
    expect(get("export { x } from 'reexported';")).toEqual(['reexported']);
    expect(get("const c = require('pg');")).toEqual(['pg']);
  });

  it('keeps the value member of a mixed type/value import', () => {
    expect(get("import { foo, type Bar } from 'mixed';")).toEqual(['mixed']);
  });

  it('excludes type-only, dynamic, comment, relative, builtin, alias imports', () => {
    expect(get("import type { C } from 'type-pkg';")).toEqual([]);
    expect(get("import { type X } from 'type-named';")).toEqual([]);
    expect(get("const { Resend } = await import('resend');")).toEqual([]);
    expect(get("/** @type {import('postcss-load-config').Config} */")).toEqual([]);
    expect(get("// import x from 'commented';")).toEqual([]);
    expect(get("import x from './local';")).toEqual([]);
    expect(get("import x from '@/lib/x';")).toEqual([]);
    expect(get("import { readFile } from 'fs';")).toEqual([]);
    expect(get("import { readFile } from 'node:fs/promises';")).toEqual([]);
  });

  it('reduces subpaths/scopes to the root package', () => {
    expect(get("import { x } from '@scope/pkg/sub';")).toEqual(['@scope/pkg']);
    expect(get("import { redirect } from 'next/navigation';")).toEqual(['next']);
  });
});

function input(partial: Partial<PhantomScanInput>): PhantomScanInput {
  return {
    declared: new Set(),
    overrides: new Set(),
    packageManager: 'pnpm',
    workspaceNames: new Set(),
    files: [],
    ...partial,
  };
}

describe('detectPhantomDeps', () => {
  it('flags an override-only build-path import as HIGH on pnpm', () => {
    const out = detectPhantomDeps(input({
      overrides: new Set(['js-yaml']),
      packageManager: 'pnpm',
      files: [{ path: 'src/lib/yaml-engine.ts', content: "import yaml from 'js-yaml';" }],
    }));
    expect(out).toEqual([
      { pkg: 'js-yaml', importSites: ['src/lib/yaml-engine.ts'], inOverrides: true, buildPath: true, severity: 'high' },
    ]);
  });

  it('flags a transitive npm build-path import as LOW', () => {
    const out = detectPhantomDeps(input({
      packageManager: 'npm',
      files: [{ path: 'lib/rehype-youtube.ts', content: "import { visit } from 'unist-util-visit';" }],
    }));
    expect(out[0]).toMatchObject({ pkg: 'unist-util-visit', inOverrides: false, buildPath: true, severity: 'low' });
  });

  it('treats script/test paths as LOW even on pnpm', () => {
    const out = detectPhantomDeps(input({
      packageManager: 'pnpm',
      files: [
        { path: 'scripts/init-db.ts', content: "import { Client } from 'pg';" },
        { path: 'src/x.test.ts', content: "import foo from 'only-in-test';" },
      ],
    }));
    expect(out.find((f) => f.pkg === 'pg')).toMatchObject({ buildPath: false, severity: 'low' });
    expect(out.find((f) => f.pkg === 'only-in-test')).toMatchObject({ buildPath: false, severity: 'low' });
  });

  it('does not flag declared or workspace packages', () => {
    const out = detectPhantomDeps(input({
      declared: new Set(['react']),
      workspaceNames: new Set(['@repo/ui']),
      files: [{ path: 'src/a.tsx', content: "import React from 'react'; import { B } from '@repo/ui';" }],
    }));
    expect(out).toEqual([]);
  });

  it('aggregates one finding across files; buildPath true if any site is build-path', () => {
    const out = detectPhantomDeps(input({
      packageManager: 'pnpm',
      files: [
        { path: 'scripts/a.ts', content: "import x from 'dup';" },
        { path: 'src/b.ts', content: "import x from 'dup';" },
      ],
    }));
    expect(out).toEqual([
      { pkg: 'dup', importSites: ['scripts/a.ts', 'src/b.ts'], inOverrides: false, buildPath: true, severity: 'high' },
    ]);
  });
});
