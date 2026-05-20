import type { ScanSource, Finding, Severity } from '../types';
import type { ProjectConfig } from '../../types';
import { runPnpmAudit } from '../../patch-scanner';
import { existsSync } from 'fs';
import { join } from 'path';

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  medium: 'medium',
  low: 'low',
  info: 'info',
};

function detectPm(projectPath: string): 'pnpm' | 'npm' | null {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  return null;
}

export const PnpmAuditSource: ScanSource = {
  id: 'pnpm-audit',
  displayName: 'pnpm/npm audit',
  findingTypes: ['vulnerability'],
  timeoutMs: 60_000,

  async isAvailable() {
    return true; // always present — uses the project's package manager
  },

  async scan(project: ProjectConfig): Promise<Finding[]> {
    const pm = detectPm(project.path);
    if (!pm) return [];

    const { vulnerabilities, raw } = await runPnpmAudit(project.path, pm);
    return vulnerabilities.map((v): Finding => {
      // Collect advisory IDs: CVEs (string array) + npm numeric advisoryId
      const advisoryIds: string[] = [
        ...(v.cves ?? []),
        ...(v.advisoryId != null ? [String(v.advisoryId)] : []),
      ];

      return {
        type: 'vulnerability',
        // dedupKey composed from source + package name + severity for stable dedup
        dedupKey: `pnpm-audit:${v.name}:${v.severity}`,
        sources: ['pnpm-audit'],
        title: v.title,
        detail: v.title,          // VulnerabilityInfo has no separate detail field
        package: v.name,
        version: v.currentVersion,
        path: v.path,
        severity: SEVERITY_MAP[v.severity] ?? 'info',
        advisoryIds,
        rawBySource: { 'pnpm-audit': raw },
        fixedIn: v.fixVersion,    // VulnerabilityInfo.fixVersion maps to Finding.fixedIn
        references: v.url ? [v.url] : [],
      };
    });
  },
};
