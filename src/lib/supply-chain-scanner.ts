// Thin adapter — delegates to @hexaxia-labs/supply-sentinel
import { scanSupplyChain as _scan } from '@hexaxia-labs/supply-sentinel';
import type { ScanResult, Finding } from '@hexaxia-labs/supply-sentinel';

export type SupplyChainFindingType =
  | 'install-script'
  | 'signature-invalid'
  | 'typosquat-suspect'
  | 'dep-confusion'
  | 'manifest-tamper'
  | 'maintainer-risk'
  | 'provenance'
  | 'blacklist';

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

const DETECTOR_TO_TYPE: Record<string, SupplyChainFindingType> = {
  'install-scripts': 'install-script',
  'signature': 'signature-invalid',
  'typosquat': 'typosquat-suspect',
  'dep-confusion': 'dep-confusion',
  'manifest-tamper': 'manifest-tamper',
  'maintainer-risk': 'maintainer-risk',
  'provenance': 'provenance',
  'blacklist': 'blacklist',
};

function mapSeverity(s: string): 'high' | 'medium' | 'low' {
  if (s === 'critical' || s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
}

function mapFinding(f: Finding): SupplyChainFinding {
  return {
    type: DETECTOR_TO_TYPE[f.detector] ?? 'install-script',
    severity: mapSeverity(f.severity),
    package: f.package,
    version: f.version,
    detail: f.detail,
  };
}

export async function scanSupplyChain(
  projectPath: string,
  projectId: string,
): Promise<SupplyChainResult> {
  const result: ScanResult = await _scan(projectPath, {
    detectors: 'all',
  });
  return {
    projectId,
    timestamp: result.timestamp,
    duration: result.duration,
    scannedPackages: result.scannedPackages,
    findings: result.findings.map(mapFinding),
  };
}
