import type { ScanSource } from '../types';
import { PnpmAuditSource } from './pnpm-audit';
import { GrypeSource } from './grype';
import { CveLiteSource } from './cve-lite';

export const SOURCES: ScanSource[] = [PnpmAuditSource, GrypeSource, CveLiteSource];
