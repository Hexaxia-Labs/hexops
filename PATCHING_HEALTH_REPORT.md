# HexOps Patching Health Report
_Session: 2026-04-26 — ~3 hours of manual remediation_

The purpose of this document is to be honest about what went wrong today, what was fixed, what is still broken, and what needs to be built so this session never repeats itself.

---

## What Happened Today (Root Cause Summary)

The core failure: **hexops was patching postcss by bumping its `devDependencies` version, then reporting success**. This was wrong in two ways:

1. Next.js 16.x pins its own `postcss@8.4.31` in `node_modules/next/node_modules/postcss`. Updating a top-level devDep doesn't touch that nested copy. Only a flat `"overrides"` entry forces npm/pnpm to collapse it.

2. After the false-success patch, the scanner re-ran npm audit, which correctly found the nested copy still vulnerable, and put postcss back in the queue. The user then re-patched it, got another false success, and so on.

This single bug cascaded into: 16 projects manually fixed, a 3-hour session, the downgrade loop discovered (next@9.3.3 on 5 projects), and multiple other latent bugs found along the way.

---

## Fixed Today

| # | What | How |
|---|------|-----|
| 1 | **EOVERRIDE crash** — npm throws when a package is in both `devDependencies` and `overrides` | Update route now deletes the devDep before writing the flat override |
| 2 | **EOVERRIDE in escalate route** | Same fix applied to escalate route |
| 3 | **Downgrade guard bypass (scanner)** — `npm audit` omits `currentVersion` when installed version exceeds `package.json` range (e.g. `^9.3.3` in package.json, `16.2.4` in node_modules). Guard checked empty string → always passed | Scanner now falls back to reading `node_modules/<pkg>/package.json` for the installed version |
| 4 | **Downgrade guard bypass (update route)** — same empty `fromVersion` issue at apply time | Update route reads node_modules before comparing `fromVersion` vs `targetVersion` |
| 5 | **git push non-fast-forward** — Dependabot merges between our commit and push | `git-push` route and escalate route now do `git pull --rebase --autostash` on rejection, then retry push |
| 6 | **Opaque git error messages** — Node's `execFile` wrapper hid git's actual stderr | Both routes now extract `.stderr` from the error object |
| 7 | **nothing-to-commit on retry treated as failure** — commit succeeded previously, push failed, retry re-committed → fail | `git commit` "nothing to commit" is now treated as success, fall through to push |
| 8 | **Escalate modal version field blank** — when `targetVersion` was `resolve-latest` or similar non-semver, the pin field showed empty | Modal now auto-fetches latest from npm registry as fallback |
| 9 | **No Scan All feedback** — no confirmation that cache was actually cleared | Info toast fires immediately on Scan All click |
| 10 | **16 projects with nested postcss@8.4.31** — false-positive patches left nested copies untouched | All manually fixed with flat `"overrides": {"postcss": "8.5.12"}` and clean reinstall |
| 11 | **5 projects with next@9.3.3 downgrade** | Restored from git, clean lockfile delete + reinstall, `next` added to holds on sailbot-ai |

---

## Still Broken (Open Issues)

### P0 — Will cause repeated false positives and wasted time

**#80 — False positive patch success for fixViaOverride**
The verification after an override patch only checks `node_modules/<pkg>/package.json` (top-level). It does not check nested copies like `node_modules/next/node_modules/postcss`. So it reports success when the nested copy is still vulnerable.

**Fix needed:** After any override install succeeds, re-run `npm audit --json` (or `pnpm audit --json`) and confirm that the advisory ID that triggered the patch is no longer present. If the advisory is still there, mark the patch as failed and surface the error. This is the only reliable end-to-end check.

---

**Reconciliation only checks top-level node_modules** (`patch-storage.ts:131–163`)
`reconcilePatchHistory` compares installed version from the scan cache against patch history. The scan cache only reads top-level `node_modules/<pkg>`. False-success entries for nested transitive deps are never retroactively flagged.

**Fix needed:** Same as above — reconciliation should re-check audit status, not just compare installed versions from a top-level read.

---

### P1 — Silent failures that look like success

**"Looks installed" heuristic is too loose** (`update/route.ts:374–378, 484–487, 653–656`)
After an install, the code checks if stdout contains words like `added`, `done`, `up to date`, or matches `/\d+ packages/`. These appear in npm output for many conditions, including "nothing changed" (`up to date`). A package that was already at the requested version satisfies this check with no actual update performed.

**Fix needed:** Replace string heuristics with a direct node_modules version read. After any install, read `node_modules/<pkg>/package.json` and compare against `targetVersion`. This is already done in the override path — it needs to be the primary check everywhere.

---

**pnpm error detection only checks stdout** (`update/route.ts:519`)
`batchStdout.includes('ERR_PNPM_')` misses errors pnpm writes to stderr.

**Fix needed:** Check both stdout and stderr for pnpm errors.

---

**Sequential fallback uses output strings, not node_modules** (`update/route.ts:653–656`)
When batch install fails and falls back to sequential per-package installs, success is determined by checking output strings (`done`, `added`). Batch install verifies by reading node_modules. These should be consistent.

**Fix needed:** Sequential path should use the same node_modules version check as batch.

---

### P2 — Correctness and safety gaps

**Escalate has no downgrade guard** (`escalate/route.ts:82–126`)
The update route refuses to apply a version older than the currently installed one. The escalate route has no such check — you can force-override to a version lower than what's installed.

**Fix needed:** Add the same effective-from-version check (including node_modules fallback) to escalate before writing the override.

---

**Stale overrides accumulate** (`update/route.ts:329–343`)
When a package moves from devDependencies to direct dependencies (or Dependabot updates it), the flat override in `package.json` is never cleaned up. Stale overrides cause EOVERRIDE errors and confuse future patches.

**Fix needed:** After each patch run, scan `overrides` / `pnpm.overrides` and remove entries where the resolved version in node_modules already satisfies the override (i.e., the constraint is no longer needed).

---

**Revert-on-failure can fail silently** (`escalate/route.ts:181–187`)
If commit/push fails and the revert (`git checkout -- package.json lockfile`) also fails, the error is swallowed (`/* ignore revert errors */`). The repo is left in an unknown state with no warning.

**Fix needed:** Log revert failures explicitly and include the revert status in the error response to the user.

---

**Git push non-fast-forward: one retry only**
The rebase-then-retry handles the common case (one Dependabot merge). If Dependabot merges again between our rebase and the retry push, it fails again with no further attempt.

**Fix needed:** Not critical. Document as a known limitation and surface a clear "rebase conflict — resolve manually" message with the branch name.

---

### P3 — Developer experience

**#78 — HMR bypass for custom server.js**
API route changes require a full hexops restart (`kill + node server.js`). This burned time during today's debugging — fixes weren't live until restart, making it look like the fixes didn't work.

**Fix needed:** Either migrate to `next dev` with proper custom server HMR support, or add a `/api/reload` endpoint that does a graceful restart, or at minimum add a build timestamp to the health check endpoint so it's verifiable that the latest code is running.

---

**#79 — No post-patch integrity check across projects**
After a patch run, there's no summary of which projects now have 0 vulnerabilities vs which still have open issues. You have to manually Scan All and review.

**Fix needed:** After a patch operation, auto-rescan the affected project and return a brief audit summary alongside the patch results.

---

## The Fix That Matters Most

Everything else is noise compared to **P0: post-patch audit verification**.

If, after every override patch, hexops ran `npm audit --json` and checked that the triggering advisory ID was gone, **none of today's manual work would have been needed**. The false success on postcss would have been caught immediately on the first project. The remaining 15 would never have queued. The nested copy problem would have been surfaced and escalated correctly instead of silently recycling.

This is the single highest-ROI fix in the codebase.

---

## Proposed Fix Order

| Priority | Issue | Estimated effort | Impact |
|----------|-------|-----------------|--------|
| 1 | Post-patch audit verification (re-run audit, check advisory ID gone) | Medium | Eliminates false positives entirely |
| 2 | Replace "looks installed" heuristics with node_modules version reads | Small | Eliminates silent success on no-ops |
| 3 | pnpm error detection: check stderr too | Tiny | Catches hidden pnpm failures |
| 4 | Stale override cleanup after patch | Small | Prevents EOVERRIDE accumulation |
| 5 | Escalate downgrade guard | Small | Prevents accidental downgrades via escalate |
| 6 | Reconciliation re-checks audit status, not just top-level versions | Medium | Retroactively catches past false successes |
| 7 | Revert-on-failure logging | Tiny | Visibility into broken states |
| 8 | HMR or restart endpoint (#78) | Medium | Dev experience |
| 9 | Post-patch rescan summary (#79) | Small | Closes the feedback loop per patch |

---

## Pattern to Never Repeat

For any transitive vulnerability where the vulnerable package is **nested inside a parent** (i.e., `fixViaOverride: true`):

1. The fix is **always** a flat `overrides` / `pnpm.overrides` entry — never a devDep version bump.
2. After writing the override, delete the lockfile and reinstall from scratch so the package manager re-resolves the entire tree.
3. After reinstall, verify by searching `node_modules` for **all copies** of the package, not just the top-level one.
4. Re-run `npm audit` / `pnpm audit` and confirm the advisory is gone.

The `postcss` + `next` combination is a permanent fixture of the Next.js ecosystem. This will keep coming up. The tooling needs to handle it correctly, not require manual intervention every time.
