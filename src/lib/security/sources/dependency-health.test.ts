import { describe, it, expect } from 'vitest';
import { collectValueImports, rootPkg, stripComments } from './dependency-health';

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
