import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export type SupplyChainFindingType = 'install-script' | 'signature-invalid' | 'typosquat-suspect' | 'no-source';

export interface SupplyChainFinding {
  type: SupplyChainFindingType;
  severity: 'high' | 'medium' | 'low';
  package: string;
  version: string;
  detail: string;
}

export interface SupplyChainResult {
  projectId: string;
  timestamp: string;
  duration: number;
  findings: SupplyChainFinding[];
  scannedPackages: number;
}

// Packages that legitimately run install scripts (build native addons, binary downloads, etc.)
const INSTALL_SCRIPT_WHITELIST = new Set([
  'esbuild', 'esbuild-darwin-64', 'esbuild-darwin-arm64', 'esbuild-linux-64', 'esbuild-linux-arm64',
  'esbuild-windows-64', 'sharp', 'canvas', 'bcrypt', 'node-gyp', 'fsevents',
  'node-sass', 'sass', 'better-sqlite3', 'sqlite3', 'nodegit', 'grpc', '@grpc/grpc-js',
  'husky', 'puppeteer', 'playwright', 'cypress', 'electron', '@electron/rebuild',
  'prebuild-install', 'node-pre-gyp', 'node-addon-api', 'bindings',
  'postinstall-postinstall', 'patch-patch', 'patch-package', 'prisma',
  '@prisma/client', 'prisma-client-js', '@swc/core', 'lightningcss',
  'turbo', '@next/swc-darwin-arm64', '@next/swc-linux-x64-gnu',
  'optionator', 'keytar', 'dtrace-provider', 'cpu-features',
]);

// Commonly impersonated packages for typosquat detection
const POPULAR_PACKAGES = [
  'lodash', 'express', 'react', 'react-dom', 'axios', 'moment', 'chalk',
  'typescript', 'webpack', 'babel-core', 'prettier', 'eslint', 'jest',
  'mocha', 'vue', 'next', 'nuxt', 'gatsby', 'vite', 'rollup', 'parcel',
  'commander', 'yargs', 'inquirer', 'dotenv', 'uuid', 'dayjs', 'date-fns',
  'underscore', 'async', 'bluebird', 'request', 'node-fetch', 'got', 'superagent',
  'morgan', 'cors', 'helmet', 'body-parser', 'multer', 'passport',
  'mongoose', 'sequelize', 'typeorm', 'prisma', 'knex', 'redis', 'ioredis',
  'socket.io', 'ws', 'rxjs', 'ramda', 'fp-ts', 'zod', 'joi', 'yup',
  'classnames', 'styled-components', 'tailwindcss', 'antd', 'material-ui',
  'lodash-es', 'immer', 'mobx', 'redux', 'zustand', 'jotai',
];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function checkTyposquat(name: string): string | null {
  // Strip scope for scoped packages
  const bare = name.startsWith('@') ? name.split('/')[1] ?? name : name;
  for (const popular of POPULAR_PACKAGES) {
    if (bare === popular) return null; // exact match = not a typosquat
    const dist = levenshtein(bare, popular);
    // Flag if very close but not identical, and similar length (avoid false positives on short names)
    if (dist === 1 && bare.length >= 4) return popular;
    if (dist === 2 && bare.length >= 7) return popular;
  }
  return null;
}

function readDirectDeps(projectPath: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

function scanInstallScripts(
  projectPath: string,
  directDeps: Record<string, string>
): SupplyChainFinding[] {
  const findings: SupplyChainFinding[] = [];
  const nmPath = join(projectPath, 'node_modules');
  if (!existsSync(nmPath)) return findings;

  const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];

  const scanPkg = (pkgName: string) => {
    const pkgJsonPath = join(nmPath, pkgName, 'package.json');
    if (!existsSync(pkgJsonPath)) return;
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const scripts: Record<string, string> = pkg.scripts ?? {};
      const hooks = INSTALL_HOOKS.filter(h => scripts[h]);
      if (hooks.length === 0) return;

      const baseName = pkgName.startsWith('@') ? pkgName.split('/').slice(-1)[0] : pkgName;
      if (INSTALL_SCRIPT_WHITELIST.has(pkgName) || INSTALL_SCRIPT_WHITELIST.has(baseName ?? '')) return;

      const version = pkg.version ?? 'unknown';
      const scriptDetails = hooks.map(h => `${h}: ${scripts[h]?.slice(0, 80)}`).join('; ');

      findings.push({
        type: 'install-script',
        severity: pkgName in directDeps ? 'medium' : 'low',
        package: pkgName,
        version,
        detail: `Install hook(s): ${scriptDetails}`,
      });
    } catch { /* skip */ }
  };

  try {
    const entries = readdirSync(nmPath);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      if (entry.startsWith('@')) {
        // scoped packages
        const scopePath = join(nmPath, entry);
        try {
          const scoped = readdirSync(scopePath);
          for (const s of scoped) scanPkg(`${entry}/${s}`);
        } catch { /* skip */ }
      } else {
        scanPkg(entry);
      }
    }
  } catch { /* skip */ }

  return findings;
}

function scanAuditSignatures(
  projectPath: string,
  packageManager: string
): SupplyChainFinding[] {
  if (packageManager !== 'npm') return [];
  try {
    const output = execSync('npm audit signatures 2>&1', {
      cwd: projectPath,
      timeout: 30000,
      maxBuffer: 512 * 1024,
    }).toString();

    const findings: SupplyChainFinding[] = [];
    // npm audit signatures outputs lines like:
    // "  X packages have invalid signatures"
    // "  package@version: invalid signature"
    const invalidMatch = output.match(/(\d+) packages? (?:have|with) invalid/i);
    if (invalidMatch) {
      const pkgLines = output.split('\n').filter(l => l.includes(': '));
      for (const line of pkgLines.slice(0, 10)) {
        const m = line.match(/^\s+(.+@\S+):\s+(.+)/);
        if (!m) continue;
        const [, pkgVer, reason] = m;
        const atIdx = pkgVer.lastIndexOf('@');
        const pkg = pkgVer.slice(0, atIdx);
        const ver = pkgVer.slice(atIdx + 1);
        findings.push({
          type: 'signature-invalid',
          severity: 'high',
          package: pkg,
          version: ver,
          detail: reason?.trim() ?? 'Invalid registry signature',
        });
      }
      if (findings.length === 0 && invalidMatch[1] !== '0') {
        findings.push({
          type: 'signature-invalid',
          severity: 'high',
          package: '(multiple)',
          version: '',
          detail: `${invalidMatch[1]} packages have invalid registry signatures`,
        });
      }
    }
    return findings;
  } catch {
    return [];
  }
}

function scanTyposquats(directDeps: Record<string, string>): SupplyChainFinding[] {
  const findings: SupplyChainFinding[] = [];
  for (const [name, version] of Object.entries(directDeps)) {
    const suspect = checkTyposquat(name);
    if (suspect) {
      findings.push({
        type: 'typosquat-suspect',
        severity: 'high',
        package: name,
        version,
        detail: `Looks like a typo of "${suspect}" (edit distance ≤ 2)`,
      });
    }
  }
  return findings;
}

function detectPackageManager(projectPath: string): string {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function scanSupplyChain(projectPath: string, projectId: string): Promise<SupplyChainResult> {
  const start = Date.now();
  const directDeps = readDirectDeps(projectPath);
  const packageManager = detectPackageManager(projectPath);

  const [installFindings, signatureFindings, typosquatFindings] = await Promise.all([
    Promise.resolve(scanInstallScripts(projectPath, directDeps)),
    Promise.resolve(scanAuditSignatures(projectPath, packageManager)),
    Promise.resolve(scanTyposquats(directDeps)),
  ]);

  const findings = [...typosquatFindings, ...signatureFindings, ...installFindings];

  const nmPath = join(projectPath, 'node_modules');
  let scannedPackages = 0;
  try {
    scannedPackages = readdirSync(nmPath).filter(e => !e.startsWith('.')).length;
  } catch { /* skip */ }

  return {
    projectId,
    timestamp: new Date().toISOString(),
    duration: Date.now() - start,
    findings,
    scannedPackages,
  };
}
