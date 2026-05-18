# HexOps Open Tasks

All tasks from the original backlog are complete as of 2026-04-27.

## Completed This Session
- [x] P0: Post-patch audit verification — surface auditSummary in patches page + package-health-section
- [x] P1: Replace "looks installed" string heuristics with node_modules version reads
- [x] P1: Fix pnpm error detection — detect ERR_PNPM_* in sequential success path (stderr+stdout)
- [x] P2: Stale override cleanup — fix scoped/ranged pnpm key parsing (pkg@>=range)
- [x] P2: Add downgrade guard to force_major in escalate route (matched force_override)
- [x] P2: verifyAuditClear now checks all attempted packages, not just pre-reconcile successes
- [x] P2: Log escalate commit/push failures and revert outcomes via logger
- [x] P3: HMR stale-server — git SHA at startup + dev-mode sidebar notice
- [x] P3: Cross-project collateral downgrade detection after patch (#79)

## Queued
- [ ] P1: Stop signal propagation + verify-port-release (#90) — plan: `docs/superpowers/plans/2026-05-18-process-lifecycle-and-metrics-fixes.md`
- [ ] P2: Metrics endpoint aggregates RSS across process tree (#91) — same plan

## Future / Large
- [ ] HexOps Agent Phase 2 — dashboard chat UI (AI SDK v6 + provider API key)
