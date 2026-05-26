import type { ProjectConfig } from '../../types';

export type PluginKind = 'installGate' | 'complianceAudit';

export type PluginHostStatus =
  | { available: true; version?: string }
  | { available: false; reason: string; installHint?: string };

export interface PluginCardData {
  status: 'enabled' | 'disabled' | 'host-missing' | 'error';
  headline: string;       // e.g. "0 blocks · last 7d"
  detail?: string;        // optional secondary line
  detailRoute?: string;   // e.g. '/security/safe-chain'
  error?: string;
}

export interface SecurityPluginBase {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PluginKind;
  readonly detailRoute?: string;
  isAvailable(): Promise<PluginHostStatus>;
  renderCard(project: ProjectConfig): Promise<PluginCardData>;
}

export interface InstallGateWrapped {
  command: ReadonlyArray<string>;
  env: NodeJS.ProcessEnv;
  onResult(result: { code: number; stdout: string; stderr: string }): Promise<InstallGateResult>;
}

export interface InstallGateResult {
  blocked: boolean;
  message?: string;
  advisoryRefs?: string[];
}

export interface InstallGatePlugin extends SecurityPluginBase {
  readonly kind: 'installGate';
  wrapInstall(args: {
    project: ProjectConfig;
    command: ReadonlyArray<string>;
    env: NodeJS.ProcessEnv;
  }): Promise<InstallGateWrapped>;
}

// Forward declaration. The first compliance-audit plugin defines the concrete report shape.
export type ComplianceReport = { ok: boolean; checks: Array<{ id: string; ok: boolean; detail?: string }> };

export interface ComplianceAuditPlugin extends SecurityPluginBase {
  readonly kind: 'complianceAudit';
  audit(project: ProjectConfig): Promise<ComplianceReport>;
}

export type SecurityPlugin = InstallGatePlugin | ComplianceAuditPlugin;
