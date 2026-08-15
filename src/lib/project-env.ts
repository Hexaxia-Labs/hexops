import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getGlobalSettings, getProjectSettings } from './settings';

/**
 * Read a project's `.env` and `.env.local` and return key-value pairs.
 *
 * Originally added for dev-server startup: Next.js 16 + Turbopack bakes env
 * vars at compile time, so if DATABASE_URL isn't in the OS-level process.env
 * when the Turbopack worker starts, it inlines undefined before .env.local
 * ever loads. Installs need the same treatment for a different reason — see
 * buildProjectEnv below.
 */
export function loadProjectEnvFile(projectPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const filename of ['.env', '.env.local']) {
    const filePath = join(projectPath, filename);
    if (!existsSync(filePath)) continue;
    try {
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key) result[key] = value;
      }
    } catch {
      // ignore unreadable files
    }
  }
  return result;
}

/**
 * Build the env overlay for a child process acting on a project.
 *
 * Package managers resolve private-registry credentials through `.npmrc`, which
 * commonly interpolates env vars (`_authToken=${GITHUB_TOKEN}`). Those vars live
 * in the developer's shell, not in the hexops server process — so an install
 * spawned by hexops inheriting only `process.env` silently loses them.
 *
 * The failure is worse than a missing credential: when pnpm cannot expand a
 * variable it discards the *entire* .npmrc, including the scope-to-registry
 * mapping. The install then queries the public registry for a private package
 * and reports a bare 404, which reads like the package doesn't exist. (#142)
 *
 * Precedence, lowest to highest:
 *   1. global GitHub integration token, exposed as GITHUB_TOKEN
 *   2. the project's own .env / .env.local
 *   3. explicit per-project env in settings
 *
 * The caller merges the result over `process.env`.
 */
export function buildProjectEnv(projectId: string, projectPath: string): Record<string, string> {
  const overlay: Record<string, string> = {};

  // hexops already stores a GitHub token for Dependabot/branch propagation.
  // Reuse it for registry auth so the common GitHub Packages case needs no
  // extra per-project configuration. Anything more specific overrides it below.
  const githubToken = getGlobalSettings().integrations?.github?.token;
  if (githubToken) overlay.GITHUB_TOKEN = githubToken;

  Object.assign(overlay, loadProjectEnvFile(projectPath));
  Object.assign(overlay, getProjectSettings(projectId).env ?? {});

  return overlay;
}

/**
 * process.env with the project's overlay applied — ready to hand to
 * exec/spawn options for any command run on a project's behalf.
 */
export function projectProcessEnv(projectId: string, projectPath: string): NodeJS.ProcessEnv {
  return { ...process.env, ...buildProjectEnv(projectId, projectPath) };
}

/**
 * Names of env vars an `.npmrc` interpolates but that are absent from the
 * merged environment. Used to fail loudly before a destructive install rather
 * than after a misleading 404.
 */
export function findMissingNpmrcVars(
  projectPath: string,
  env: Record<string, string | undefined>
): string[] {
  const npmrcPath = join(projectPath, '.npmrc');
  if (!existsSync(npmrcPath)) return [];

  let contents: string;
  try {
    contents = readFileSync(npmrcPath, 'utf-8');
  } catch {
    return [];
  }

  const missing = new Set<string>();
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    for (const match of trimmed.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
      const name = match[1];
      if (!env[name]) missing.add(name);
    }
  }
  return [...missing];
}
