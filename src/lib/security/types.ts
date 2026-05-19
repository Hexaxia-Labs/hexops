import type { ProjectConfig } from '../types';

export type FindingType =
  | 'vulnerability'
  | 'integrity'
  | 'secret'
  | 'license'
  | 'config';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface Finding {
  type: FindingType;
  dedupKey: string;
  sources: string[];
  title: string;
  detail: string;
  package?: string;
  version?: string;
  path?: string;
  severity: Severity;
  cvss?: number;
  divergent?: boolean;
  advisoryIds: string[];
  rawBySource: Record<string, unknown>;
  fixedIn?: string;
  references: string[];
}

export type SourceStatus = 'ok' | 'failed' | 'unavailable' | 'timeout';

export interface SourceResult {
  id: string;
  status: SourceStatus;
  startedAt: string;
  durationMs: number;
  findingCount: number;
  error?: string;
  warning?: string;
}

export interface ScanResult {
  cacheVersion: 1;
  projectId: string;
  timestamp: string;
  durationMs: number;
  sources: Record<string, SourceResult>;
  findings: Finding[];
}

export interface ScanSource {
  id: string;
  displayName: string;
  findingTypes: FindingType[];
  timeoutMs?: number;
  isAvailable(): Promise<boolean>;
  scan(project: ProjectConfig): Promise<Finding[]>;
}
