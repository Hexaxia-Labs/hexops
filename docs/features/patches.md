# Patches

The Patches page provides centralized management of package updates and security vulnerabilities across all projects.

## Overview

Access the Patches page from the sidebar or navigate to `/patches`.

The page scans all configured projects for:
- **Security Vulnerabilities** — via `npm audit` / `pnpm audit` / `yarn audit`
- **Outdated Packages** — via `npm outdated` / `pnpm outdated` / `yarn outdated`

---

## Filter Bar

### Row 1 — Type & View
| Control | Options |
|---------|---------|
| **Type** | All · Vulns · Outdated |
| **View** | Flat list · Grouped by project |

### Row 2 — Badges & Actions
| Element | Meaning |
|---------|---------|
| `N overrides` | Transitive deps that will be fixed via PM override block |
| `N breaking` | Updates that require a semver-major version change |
| `On Hold (N)` | Toggle to show/hide held packages |
| **Select All / Update Selected** | Appear when items are selected |

---

## Patch Information

Each patch row shows:

| Column | Description |
|--------|-------------|
| Checkbox | Select for batch update |
| Package Name | npm package name |
| Current | Currently installed version |
| Latest | Latest available version |
| Type | major / minor / patch / security |
| Severity | For vulnerabilities: critical / high / moderate / low |

---

## Updating Packages

### Batch Update
1. Select packages with checkboxes (or **Select All**)
2. Click **Update Selected**
3. HexOps applies patches per project, shows progress
4. After completion: a **post-patch audit banner** confirms which advisories cleared and how many vulnerabilities remain

### Post-Patch Audit Verification
After every update, HexOps re-runs `audit --json` on the affected packages to confirm advisories are actually gone — not just that the top-level version changed. A nested transitive copy can survive an override and still be vulnerable. The banner reports:
- ✓ All advisories cleared
- ⚠ N vulns still remain: `pkg-a`, `pkg-b`…

If an advisory survives, the package is marked as failed and the error message suggests escalation.

---

## Override-Aware Patching

When a vulnerable package is a **transitive dependency** (not in your `package.json`), HexOps:
1. Injects an entry into `pnpm.overrides` / `npm overrides` / `yarn resolutions`
2. Runs install to force the pinned version
3. Verifies the override landed in `node_modules`
4. Cleans stale overrides after a direct dep update supersedes them

### Active Overrides Panel
The Patches page shows all currently active overrides with package name, pinned version, and reason. Remove any override from this panel.

---

## Escalate / Triage Mode

When a standard patch fails (peer dep conflict, breaking change, unfixable transitive), use the **Escalate** action to choose a resolution strategy:

| Action | What Happens |
|--------|-------------|
| `force_override` | Writes a PM override and commits it. Downgrade guard prevents pinning an older version than what's installed. |
| `force_major` | Updates the direct dependency to a major version bump. Requires manual review — does NOT auto-commit. |
| `accepted_risk` | Records an acknowledged risk with optional expiry date (max configurable days). Package stays held. |

All escalation records are stored and visible in the escalation history.

---

## Package Holds

Hold a package to exclude it from all automatic and batch updates:
- Per-project, per-package
- Held packages appear greyed out in the queue
- Toggle **On Hold** in the filter bar to show/hide them
- Remove a hold from the package row or the Holds section in Project Settings

---

## Cross-Project Integrity Check

After any patch, HexOps scans all other projects that share the same package and checks whether any have it installed at a version **older** than the target. If detected:
- A warning is logged to the activity log
- A notification is fired: "Possible collateral downgrade detected"
- Affected project names are listed

This catches incidents where stale advisory data or npm registry glitches downgrade a package across multiple projects simultaneously.

---

## Patch Trends

Navigate to `/patches/trends` (or click **Trends** in the Patches header) for:
- 26-week rolling chart of patch volume (success vs failure)
- KPI cards: total patches, success rate, average per week
- Per-project breakdown sorted by patch volume

---

## Scan Controls

| Button | Action |
|--------|--------|
| **Scan All** | Streams scan progress via SSE, updates the queue in real time |
| **Refresh** | Reload from cache without re-scanning |
| **Export CSV** | Download patch history as CSV |
| **Trends** | Navigate to the trends dashboard |

Cache TTL is 1 hour with up to 15 minutes of jitter to prevent thundering herd across many projects.

---

## .hexops-ignore

Create a `.hexops-ignore` file in any project root to suppress specific scanner rules:

```
# Suppress specific scan rules (one rule ID per line)
hardcoded-api-key
debug-true
```

---

## Supported Package Managers

| Manager | Audit | Outdated | Overrides | Lockfile Repair |
|---------|-------|----------|-----------|-----------------|
| pnpm | Yes | Yes | `pnpm.overrides` | Yes (`--no-frozen-lockfile`) |
| npm | Yes | Yes | `overrides` | Yes (`--legacy-peer-deps`) |
| yarn | Yes | Yes | `resolutions` | Partial |
