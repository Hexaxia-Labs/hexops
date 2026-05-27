import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export type ExceptionClassification =
  | 'risk-accepted'
  | 'false-positive'
  | 'compensating-control'
  | 'deferred'
  | 'unfixable'
  | 'deviation';

export interface SecurityException {
  id: string;
  projectId: string;
  scope: 'parent-package';        // future: 'finding'
  parentPackage: string;
  classification: ExceptionClassification;
  reason: string;
  notes?: string;
  createdBy: string;
  createdAt: string;              // ISO
  expiresAt?: string;             // ISO; absent = no expiry
  reviewedBy?: string;
  reviewedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
}

interface ExceptionsFile {
  version: 1;
  exceptions: SecurityException[];
}

let exceptionsDir = join(process.cwd(), '.hexops');

/** Override the exceptions directory — for unit tests only. */
export function _setExceptionsDirForTest(dir: string) {
  exceptionsDir = dir;
}

function fileFor(projectId: string): string {
  return join(exceptionsDir, `exceptions-${projectId}.json`);
}

function readFile(projectId: string): ExceptionsFile {
  const path = fileFor(projectId);
  if (!existsSync(path)) return { version: 1, exceptions: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ExceptionsFile;
  } catch {
    return { version: 1, exceptions: [] };
  }
}

function writeFile(projectId: string, data: ExceptionsFile): void {
  const path = fileFor(projectId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function genId(): string {
  return `exc_${randomBytes(8).toString('hex')}`;
}

export function listExceptions(projectId: string): SecurityException[] {
  return readFile(projectId).exceptions;
}

export function isExceptionActive(e: SecurityException, now = new Date()): boolean {
  if (e.revokedAt) return false;
  if (e.expiresAt && new Date(e.expiresAt) <= now) return false;
  return true;
}

export function listActiveExceptions(projectId: string, now = new Date()): SecurityException[] {
  return listExceptions(projectId).filter((e) => isExceptionActive(e, now));
}

export function createException(args: {
  projectId: string;
  parentPackage: string;
  classification: ExceptionClassification;
  reason: string;
  notes?: string;
  expiresAt?: string;
  createdBy?: string;
}): SecurityException {
  const file = readFile(args.projectId);
  const exc: SecurityException = {
    id: genId(),
    projectId: args.projectId,
    scope: 'parent-package',
    parentPackage: args.parentPackage,
    classification: args.classification,
    reason: args.reason,
    notes: args.notes,
    createdBy: args.createdBy ?? process.env.USER ?? 'unknown',
    createdAt: new Date().toISOString(),
    expiresAt: args.expiresAt,
  };
  file.exceptions.push(exc);
  writeFile(args.projectId, file);
  return exc;
}

export function revokeException(args: {
  projectId: string;
  exceptionId: string;
  revokedBy?: string;
  revokeReason?: string;
}): SecurityException | undefined {
  const file = readFile(args.projectId);
  const exc = file.exceptions.find((e) => e.id === args.exceptionId);
  if (!exc || exc.revokedAt) return exc;
  exc.revokedAt = new Date().toISOString();
  exc.revokedBy = args.revokedBy ?? process.env.USER ?? 'unknown';
  exc.revokeReason = args.revokeReason;
  writeFile(args.projectId, file);
  return exc;
}

export function updateException(args: {
  projectId: string;
  exceptionId: string;
  updates: Partial<Pick<SecurityException, 'classification' | 'reason' | 'notes' | 'expiresAt'>>;
  updatedBy?: string;
}): SecurityException | undefined {
  const file = readFile(args.projectId);
  const exc = file.exceptions.find((e) => e.id === args.exceptionId);
  if (!exc || exc.revokedAt) return exc;
  // Apply only the fields explicitly present in updates (preserve omitted)
  if (args.updates.classification !== undefined) exc.classification = args.updates.classification;
  if (args.updates.reason !== undefined) exc.reason = args.updates.reason;
  if ('notes' in args.updates) exc.notes = args.updates.notes;        // allow clearing to undefined
  if ('expiresAt' in args.updates) exc.expiresAt = args.updates.expiresAt;
  writeFile(args.projectId, file);
  return exc;
}

/**
 * Returns the set of parentPackage values that have an active exception.
 * Findings whose parent matches one of these are filtered from aggregate
 * counts and (by default) from the visible findings list.
 */
export function activeExceptionParentSet(projectId: string, now = new Date()): Set<string> {
  return new Set(listActiveExceptions(projectId, now).map((e) => e.parentPackage));
}
