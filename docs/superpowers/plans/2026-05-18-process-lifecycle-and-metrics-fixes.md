# Process Lifecycle & Metrics Fixes

**Date**: 2026-05-18
**Status**: Queued
**Issues**: [#90](https://github.com/Hexaxia-Labs/hexops/issues/90), [#91](https://github.com/Hexaxia-Labs/hexops/issues/91)
**Scope**: `src/lib/process-manager.ts`, `src/app/api/projects/[id]/stop/route.ts`, `src/app/api/projects/[id]/metrics/route.ts`

## Problem

Diagnosed 2026-05-18 against hexaxia.ai-dev. Two distinct bugs in HexOps surface as "slow start/stop/restart" and "high memory".

1. **#90 — Stop returns success while next-server keeps running.** `startProject` uses `shell: true`, so the tracked child is `sh -c "pnpm dev"`. POSIX `sh` does not forward SIGTERM to children. The port stays bound, restart's 10s status poll never sees `stopped`, and start refuses with "already running". Orphans accumulate over time (three confirmed leftover `postcss.js` workers from May 17 still resident).
2. **#91 — Metrics endpoint reports single-PID RSS.** Excludes the node wrapper(s) and worker children. Real total is ~25% higher than displayed for a typical Next 16 dev project.

Both follow the same anti-pattern flagged in #80: an API path returns success without verifying the underlying state.

## Goals

- Stop actually stops. `/api/projects/[id]/stop` returns success only when `checkPort` is false.
- Restart completes in roughly the time it takes next-server to boot, not 10s+.
- No orphan processes survive a clean stop.
- Memory reporting reflects the project's full process tree, not one PID.

## Non-Goals

- Dropping `shell: true`. Changing how `project.scripts` are parsed is more invasive than needed; process-group spawn solves the signal problem without touching the script-parsing path.
- Refactoring `process-manager.ts` more broadly (auto-restart, log handling, etc.) — out of scope.
- UI changes beyond what's needed to show a process-tree breakdown (deferred to a follow-up if useful).

## Approach

### Step 1 — Process-group spawn (`src/lib/process-manager.ts`)

Change the `spawn` call at line 145 to use `detached: true`. This puts the shell, pnpm, node wrapper, and next-server in a single process group keyed by the shell's PID. With `detached: true` and no `child.unref()`, the parent still tracks the child normally — `detached` here is used solely for process-group semantics on POSIX.

Update `child.on('spawn')` logging to record the PGID alongside PID (for debugging orphan-hunt cases).

### Step 2 — Signal the group, verify port release (`stopProject`)

Replace the SIGTERM-and-return block at `process-manager.ts:263–272` with:

1. `process.kill(-entry.process.pid, 'SIGTERM')` — negative PID signals the whole group.
2. Poll `checkPort(port)` every 100ms for up to 2000ms.
3. If still bound, escalate: `process.kill(-entry.process.pid, 'SIGKILL')`, poll again for 500ms.
4. If *still* bound (entirely external process on the port), fall through to the existing `ss` + `kill -9` path on lines 274–306 — that code stays as a last-resort safety net.
5. Only return `{success: true}` after `checkPort` reports the port is free. On timeout, return a real error so the UI can show "Stop timed out — process may still be running" instead of a misleading success toast.

Edge case: tracked process already exited (entry exists but `entry.process.killed === true`, or the kill throws ESRCH). Skip the group-kill and go straight to the port-based fallback path. The current `catch` block at lines 269–270 already handles this — keep that behavior, but route into the verification poll afterward instead of returning success blindly.

### Step 3 — Stop route stays mostly unchanged

`/api/projects/[id]/stop/route.ts` already returns the result of `stopProject` as `{success, error}`. With Step 2, an unverified stop becomes a real `error: 'Stop timed out: port <N> still bound'`. The route's existing `if (!result.success)` branch handles this. No changes required beyond confirming the error surfaces correctly in the UI toast.

### Step 4 — Process-tree RSS aggregation (`metrics/route.ts`)

Replace `getProcessMetricsFromPid` at `src/app/api/projects/[id]/metrics/route.ts:50–73` with a tree-walking implementation:

1. Resolve root PID as today (internal tracking → port lookup).
2. Walk descendants via `ps -o pid,ppid,rss,%cpu,command --ppid <pid>` recursively (or one-shot via `ps -e -o pid,ppid,rss,%cpu,command` filtered by ancestry). Cap depth at ~5 to avoid pathological loops.
3. Sum `rss` (KB) and `%cpu` across the tree.
4. Return aggregated `memoryMB`, `cpuPercent`, and a new optional `tree: Array<{pid, command, rssMB, cpu}>` field for future UI use.

Keep `uptime` and `command` tied to the root PID — those don't aggregate sensibly.

### Step 5 — Tests / verification

Manual verification against hexaxia.ai-dev (the project that surfaced the issue):

1. Start hexaxia.ai from the dashboard. Confirm process tree via `ps`.
2. Click Stop. Confirm:
   - `/api/projects/hexaxia-ai/stop` returns success only after port 3070 is free.
   - No `next-server`, `node`, or worker process from hexaxia.ai-dev survives.
3. Click Restart. Confirm wall-clock time is roughly next-server boot time (\~3–5s), not 10s+.
4. Open the project detail panel. Confirm `memoryMB` is now ~25% higher than the pre-fix number and approximately matches `ps aux | grep hexaxia.ai-dev` summed by hand.
5. Repeat for one other managed project (e.g. hexaxia.tech-dev) to confirm no regression.

No automated tests added — the codebase doesn't have process-manager test scaffolding today, and writing it for one fix is out of scope. Manual verification is recorded in the PR description.

### Step 6 — Reap existing orphans

One-off cleanup, not part of the PR: kill the three leftover `postcss.js` workers from May 17 (PIDs 240131, 404596, 523421) before/after deployment so the dashboard memory numbers reflect the new aggregation cleanly. Manual `kill -9` — don't bake this into HexOps.

## Risks

- **Process-group kill on a tracked-but-untracked descendant.** If a project's `dev` script spawns long-lived background services the user *wants* to survive a HexOps restart (none observed today), `kill -group` would take them down too. Acceptable trade-off — HexOps's contract is "start and stop the project's dev process tree".
- **`ps --ppid` performance.** Walking 5 levels deep across 24 managed projects every metrics poll is fine on a workstation but worth keeping cheap. Single `ps -eo pid,ppid,rss,%cpu,command` call + in-memory filter is ~10ms; that's the implementation to pick.
- **Detached spawn on macOS/Linux subtleties.** All HexOps users run on Linux (WSL2 primarily). No macOS-specific testing needed.

## Acceptance Criteria (rolled up from both issues)

- `/api/projects/[id]/stop` returns `{success: true}` only after `checkPort` is false.
- Restart wall-clock time ≤ next-server cold-boot time + 1s.
- No orphan processes from a managed project survive a clean stop.
- `metrics.process.memoryMB` reflects the project's full process tree within ±5% of `ps aux` ground truth.
- No regression for stop-on-already-crashed-project or stop-on-untracked-project paths.

## Out-of-Scope Follow-ups

- UI: surface the `tree` breakdown in the project detail panel (table, sparkline). Open a separate issue if the new data is useful.
- Orphan detection across project boundaries (e.g. flag leftover workers in the system metrics view). Probably a P3.
- Drop `shell: true` and switch to explicit argv parsing. Worth doing eventually for the security note at line 134; defer until there's a real reason.
