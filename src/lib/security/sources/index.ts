import type { ScanSource } from '../types';
import { PnpmAuditSource } from './pnpm-audit';
import { GrypeSource } from './grype';

export const SOURCES: ScanSource[] = [PnpmAuditSource, GrypeSource];
