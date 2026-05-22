# HexOps CI + README Badges — Design

**Date:** 2026-05-22
**Status:** Approved (pending spec review)
**Author:** HexOps Agent (with Aaron)

## Goal

HexOps is an open-source project (`github.com/Hexaxia-Technologies/hexops`, MIT) with no
continuous integration. Add a GitHub Actions CI pipeline that gates pushes and PRs, and
refresh the README badges to reflect real project state — including a live CI-status badge.

## Constraints / Findings

- **`file:../supply-sentinel` blocks CI.** The most recent commit (`d373834`, at HEAD,
  unpushed) replaced the inline supply-chain scanner with a thin adapter that depends on
  `@hexaxia-labs/supply-sentinel` via `file:../supply-sentinel`. A clean CI runner has no
  sibling directory, so `pnpm install` fails before any check runs. supply-sentinel is a
  separate project (`github.com/Hexaxia-Labs/supply-sentinel`, unpublished) and is **not**
  meant to be coupled to hexops yet.
- **`pnpm lint` (biome) exits 1** on ~125 pre-existing warnings. A hard lint gate would make
  every CI run red on day one.
- **`next build` does not need the gitignored `hexops.config.json`.** `loadConfig()`
  (`src/lib/config.ts`) is lazy and falls back to an empty config on read failure. CI copies
  `hexops.config.example.json` as cheap insurance regardless.
- **Actual toolchain:** Node `v24.14.1`, pnpm `10.33.0`. README badge ("Node 20+") is stale.
  No version pinning exists (`engines` / `packageManager` / `.nvmrc` all absent) — left as-is
  per "keep minimal"; CI sets versions inline.
- Tests are vitest only (16 test files, 75 tests passing). No Playwright in `package.json`.
  `tsc --noEmit` is clean. No `typecheck` script exists yet.

## Design

### 1. Decouple supply-sentinel (prerequisite)

`git revert d373834`. This restores the self-contained 240-line inline
`src/lib/supply-chain-scanner.ts`, drops the `file:../supply-sentinel` dependency from
`package.json`, reverts `pnpm-lock.yaml`, and restores the prior `TYPE_LABEL` in
`supply-chain-section.tsx`. Result: hexops is standalone and installs on a fresh runner.

The revert loses the adapter's expanded 8-detector `SupplyChainFindingType`; that capability
is tied to supply-sentinel and returns when the integration is redone (tracking issue below).

### 2. CI workflow — `.github/workflows/ci.yml`

- **Triggers:** `push` to `main`; all `pull_request`.
- **Runner:** `ubuntu-latest`.
- **Toolchain (inline, no pin files):** Node `24` via `actions/setup-node`; pnpm `10` via
  `pnpm/action-setup`; pnpm store cached via `setup-node`'s `cache: pnpm`.
- **Single `ci` job, sequential steps** (one shared install, one clean status badge):
  1. `actions/checkout`
  2. `pnpm/action-setup` (version 10)
  3. `actions/setup-node` (node-version 24, cache pnpm)
  4. `pnpm install --frozen-lockfile`
  5. **Typecheck** — `pnpm typecheck` → **blocking**
  6. **Test** — `pnpm test` (`vitest run`) → **blocking**
  7. **Lint** — `pnpm lint` with `continue-on-error: true` → **non-blocking** (reports the
     pre-existing warnings without failing CI)
  8. **Build** — copy `hexops.config.example.json` → `hexops.config.json`, then `next build`
     → **blocking**

### 3. New `package.json` script

Add `"typecheck": "tsc --noEmit"`. This is the only `package.json` change (the revert removes
the supply-sentinel dep separately).

### 4. README badges

Replace the existing 4-badge block at the top of `README.md` with:

| Badge | Source | Notes |
|-------|--------|-------|
| CI status | `github.com/Hexaxia-Technologies/hexops/actions/workflows/ci.yml/badge.svg` | live green/red |
| Version | `img.shields.io/github/package-json/v/Hexaxia-Technologies/hexops` | dynamic — reads `package.json` on default branch, never goes stale (fixes 0.20.0→0.20.1 drift) |
| License | `img.shields.io/badge/license-MIT-blue.svg` | keep |
| Node | `img.shields.io/badge/node-24-brightgreen.svg` | **updated** from "20+" to match reality |
| Next.js | `img.shields.io/badge/Next.js-16-black.svg` | keep |
| PRs welcome | `img.shields.io/badge/PRs-welcome-brightgreen.svg` | new (open-source signal) |
| code style | `img.shields.io/badge/code_style-biome-60a5fa.svg` | new |

### 5. Tracking issues (filed on `Hexaxia-Technologies/hexops`)

- **Re-integrate supply-sentinel into hexops after refactor** — records that `d373834` was
  reverted to decouple for CI; integration to be redone once hexops refactoring is ready.
- **Drive biome lint to zero warnings, then make the CI lint step blocking** — flip
  `continue-on-error` off once `pnpm lint` is clean.

## Out of scope

- Publishing supply-sentinel to a registry; git submodules.
- Version-pinning files (`engines`, `packageManager`, `.nvmrc`).
- Node version matrix (single Node 24).
- Fixing the ~125 biome warnings in this pass.
- Playwright/e2e in CI.

## Testing / Verification

- After revert: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`
  all succeed locally (no `../supply-sentinel` present).
- Workflow YAML validated; first push/PR shows the `ci` badge resolving green.
- README badges render and point at the correct repo path.
