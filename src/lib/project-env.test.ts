// biome-ignore-all lint/suspicious/noTemplateCurlyInString: .npmrc fixtures contain literal ${VAR} placeholders — that is the thing under test
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mockGlobalSettings = vi.fn();
const mockProjectSettings = vi.fn();

vi.mock('./settings', () => ({
  getGlobalSettings: () => mockGlobalSettings(),
  getProjectSettings: () => mockProjectSettings(),
}));

import { buildProjectEnv, findMissingNpmrcVars, loadProjectEnvFile } from './project-env';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hexops-env-'));
  mockGlobalSettings.mockReturnValue({ integrations: { github: { token: null } } });
  mockProjectSettings.mockReturnValue({ env: {} });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('loadProjectEnvFile', () => {
  it('reads .env and lets .env.local win', () => {
    writeFileSync(join(dir, '.env'), 'A=1\nB=base\n');
    writeFileSync(join(dir, '.env.local'), 'B=local\n');
    expect(loadProjectEnvFile(dir)).toEqual({ A: '1', B: 'local' });
  });

  it('skips comments and blank lines', () => {
    writeFileSync(join(dir, '.env'), '# comment\n\nA=1\nnot-a-pair\n');
    expect(loadProjectEnvFile(dir)).toEqual({ A: '1' });
  });

  it('returns empty when no env files exist', () => {
    expect(loadProjectEnvFile(dir)).toEqual({});
  });
});

describe('buildProjectEnv', () => {
  it('exposes the global GitHub integration token as GITHUB_TOKEN', () => {
    mockGlobalSettings.mockReturnValue({ integrations: { github: { token: 'ghp_global' } } });
    expect(buildProjectEnv('p', dir).GITHUB_TOKEN).toBe('ghp_global');
  });

  it('lets project settings override the global token', () => {
    mockGlobalSettings.mockReturnValue({ integrations: { github: { token: 'ghp_global' } } });
    mockProjectSettings.mockReturnValue({ env: { GITHUB_TOKEN: 'ghp_project' } });
    expect(buildProjectEnv('p', dir).GITHUB_TOKEN).toBe('ghp_project');
  });

  it('ranks project settings above .env files', () => {
    writeFileSync(join(dir, '.env'), 'TOKEN=from-file\n');
    mockProjectSettings.mockReturnValue({ env: { TOKEN: 'from-settings' } });
    expect(buildProjectEnv('p', dir).TOKEN).toBe('from-settings');
  });

  it('ranks .env files above the global token fallback', () => {
    mockGlobalSettings.mockReturnValue({ integrations: { github: { token: 'ghp_global' } } });
    writeFileSync(join(dir, '.env'), 'GITHUB_TOKEN=from-file\n');
    expect(buildProjectEnv('p', dir).GITHUB_TOKEN).toBe('from-file');
  });

  it('tolerates missing settings shapes', () => {
    mockGlobalSettings.mockReturnValue({});
    mockProjectSettings.mockReturnValue({});
    expect(buildProjectEnv('p', dir)).toEqual({});
  });
});

describe('findMissingNpmrcVars', () => {
  it('reports a variable the environment lacks', () => {
    writeFileSync(join(dir, '.npmrc'), '//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}\n');
    expect(findMissingNpmrcVars(dir, {})).toEqual(['GITHUB_TOKEN']);
  });

  it('reports nothing when the variable is present', () => {
    writeFileSync(join(dir, '.npmrc'), '//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}\n');
    expect(findMissingNpmrcVars(dir, { GITHUB_TOKEN: 'x' })).toEqual([]);
  });

  it('treats an empty-string value as missing', () => {
    writeFileSync(join(dir, '.npmrc'), '_authToken=${TOK}\n');
    expect(findMissingNpmrcVars(dir, { TOK: '' })).toEqual(['TOK']);
  });

  it('ignores commented lines', () => {
    writeFileSync(join(dir, '.npmrc'), '# _authToken=${OLD}\n; also=${OLDER}\n');
    expect(findMissingNpmrcVars(dir, {})).toEqual([]);
  });

  it('deduplicates repeated references', () => {
    writeFileSync(join(dir, '.npmrc'), 'a=${T}\nb=${T}\n');
    expect(findMissingNpmrcVars(dir, {})).toEqual(['T']);
  });

  it('returns empty when there is no .npmrc', () => {
    expect(findMissingNpmrcVars(dir, {})).toEqual([]);
  });
});
