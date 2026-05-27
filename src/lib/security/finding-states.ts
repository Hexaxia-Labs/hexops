import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Finding } from './types';

export interface FindingState {
  firstSeenAt: string;          // ISO
  lastSeenAt: string;           // ISO
  status: 'open' | 'resolved';  // 'open' = present in latest scan; 'resolved' = not present in latest scan
  severity?: string;            // captured at first-seen for stability if Finding shape changes
  parentPackage?: string;
  advisoryIds?: string[];
  // 'excepted' status is a UI-derived concept (computed from active exceptions) — NOT stored here.
}

interface FindingStatesFile {
  version: 1;
  states: Record<string, FindingState>;   // keyed by dedupKey
}

const DEFAULT_STATES_DIR = join(process.cwd(), '.hexops');

/** Override the states directory — for unit tests only. */
let _testDir: string | undefined;
export function _setFindingStatesDirForTest(dir?: string): void {
  _testDir = dir;
}

function statesDir(): string {
  return _testDir ?? DEFAULT_STATES_DIR;
}

function fileFor(projectId: string): string {
  return join(statesDir(), `finding-states-${projectId}.json`);
}

function readFile(projectId: string): FindingStatesFile {
  const path = fileFor(projectId);
  if (!existsSync(path)) return { version: 1, states: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as FindingStatesFile;
  } catch {
    return { version: 1, states: {} };
  }
}

function writeFile(projectId: string, data: FindingStatesFile): void {
  const path = fileFor(projectId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function getFindingStates(projectId: string): Record<string, FindingState> {
  return readFile(projectId).states;
}

export interface ScanDiff {
  newlyDetected: string[];    // dedupKeys appearing for the first time
  redetected: string[];       // dedupKeys present now but had status 'resolved' previously
  resolved: string[];         // dedupKeys that WERE open in the previous state but are NOT in current findings
  stillOpen: string[];        // dedupKeys present in both states
}

/**
 * Apply a scan to the stored states. Returns a diff describing transitions
 * AND persists the updated states.
 *
 * Pure-ish: the diff is computed deterministically from inputs; the write is
 * the only IO side effect. Designed so callers can log each transition with
 * confidence about the meaning.
 */
export function applyScan(
  projectId: string,
  currentFindings: Finding[],
  now: Date = new Date(),
): ScanDiff {
  const file = readFile(projectId);
  const prevStates = file.states;
  const currentKeys = new Set(currentFindings.map(f => f.dedupKey));
  const nowIso = now.toISOString();

  const newlyDetected: string[] = [];
  const redetected: string[] = [];
  const stillOpen: string[] = [];

  for (const f of currentFindings) {
    const prev = prevStates[f.dedupKey];
    if (!prev) {
      newlyDetected.push(f.dedupKey);
      file.states[f.dedupKey] = {
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        status: 'open',
        severity: f.severity,
        parentPackage: undefined,                  // parent derivation lives in UI; we just snapshot Finding-level data here
        advisoryIds: f.advisoryIds.slice(),
      };
    } else if (prev.status === 'resolved') {
      redetected.push(f.dedupKey);
      file.states[f.dedupKey] = {
        ...prev,
        lastSeenAt: nowIso,
        status: 'open',
      };
    } else {
      stillOpen.push(f.dedupKey);
      file.states[f.dedupKey] = {
        ...prev,
        lastSeenAt: nowIso,
      };
    }
  }

  // Mark previously-open dedupKeys that are now absent as resolved
  const resolved: string[] = [];
  for (const [key, prev] of Object.entries(prevStates)) {
    if (currentKeys.has(key)) continue;
    if (prev.status !== 'open') continue;
    resolved.push(key);
    file.states[key] = {
      ...prev,
      status: 'resolved',
      // lastSeenAt stays at the previous value — it's the last time the finding was confirmed present
    };
  }

  writeFile(projectId, file);
  return { newlyDetected, redetected, resolved, stillOpen };
}

/**
 * Read-only accessor for first-seen lookups (used by the UI to show
 * "first seen N days ago" on finding rows).
 */
export function firstSeenIndex(projectId: string): Record<string, string> {
  const out: Record<string, string> = {};
  const states = getFindingStates(projectId);
  for (const [key, s] of Object.entries(states)) out[key] = s.firstSeenAt;
  return out;
}
