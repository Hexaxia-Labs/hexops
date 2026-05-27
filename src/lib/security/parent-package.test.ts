import { describe, it, expect } from 'vitest';
import { deriveParentPackage } from './parent-package';

const mkFinding = (path: string | undefined) => ({
  path, type: 'vulnerability', dedupKey: 'x', sources: [], title: '',
  detail: '', severity: 'info', advisoryIds: [], rawBySource: {}, references: [],
} as any);

describe('deriveParentPackage', () => {
  it('extracts top-level dep from node_modules path', () => {
    expect(deriveParentPackage(mkFinding('/node_modules/esbuild/bin/esbuild'))).toBe('esbuild');
  });
  it('extracts scoped dep', () => {
    expect(deriveParentPackage(mkFinding('/node_modules/@swc/core/native.node'))).toBe('@swc/core');
  });
  it('extracts nested transitive (takes outermost parent)', () => {
    expect(deriveParentPackage(mkFinding('/foo/node_modules/next/node_modules/postcss'))).toBe('next');
  });
  it('returns undefined when path is absent', () => {
    expect(deriveParentPackage(mkFinding(undefined))).toBeUndefined();
  });
  it('returns undefined for paths without node_modules', () => {
    expect(deriveParentPackage(mkFinding('/usr/local/bin/something'))).toBeUndefined();
  });
  it('handles path with leading node_modules (no leading slash)', () => {
    expect(deriveParentPackage(mkFinding('node_modules/lodash/lodash.js'))).toBe('lodash');
  });
  it('extracts scoped dep with nested path', () => {
    expect(deriveParentPackage(mkFinding('/node_modules/@babel/core/lib/index.js'))).toBe('@babel/core');
  });
});
