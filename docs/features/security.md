# Security Scanning

HexOps includes three complementary security layers. CVE Lite and the fleet-wide Security dashboard are available from the sidebar; the Code Security and Supply Chain scanners are available per-project from the project detail view.

> **Note:** Security features in HexOps are actively evolving. CVE Lite is early access — the scanning pipeline, fix workflows, and artifact formats may change between releases.

---

## Setup

### CVE Lite

`cve-lite-cli` ships as a dev dependency of HexOps — no separate install needed. Running `pnpm install` at the HexOps root is all that's required. The binary is available at `node_modules/.bin/cve-lite`.

To confirm it's available:

```bash
./node_modules/.bin/cve-lite --version
```

### Grype (optional)

[Grype](https://github.com/anchore/grype) is an optional system binary that provides a second vulnerability source alongside `pnpm audit`. When present, HexOps automatically runs it per-project and merges findings with the other sources. When absent, the source status shows `unavailable` and it is silently skipped — no errors, no empty panels.

**Linux / WSL:**

```bash
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b ~/.local/bin
```

**macOS (Homebrew):**

```bash
brew install grype
```

Confirm install:

```bash
grype version
```

Grype maintains its own vulnerability database. HexOps triggers `grype db update` automatically if the database is older than 7 days.

---

## Fleet Security Dashboard

Available at `/security` in the sidebar. Shows merged findings from all active sources for any project in the fleet.

### Selecting a Project

Use the **project** dropdown at the top to switch between projects. Findings load from the most recent cached scan; the source strip shows when each source last ran.

### Filters

Two filters narrow the findings table without triggering a new scan:

| Filter | Values |
|--------|--------|
| **Type** | All types / vulnerability / integrity / secret / license / config |
| **Severity** | All severities / critical / high / medium / low / info |

### Source Strip

A compact status bar above the findings table shows each scanner's last result:

```
pnpm-audit ✓  3m ago    grype ✓  3m ago    cve-lite ✗  · error          [Rescan]
```

| Indicator | Meaning |
|-----------|---------|
| `✓` green | Source ran and returned findings (or a clean result) |
| `✗` red | Source ran but encountered an error |
| `timeout` yellow | Source exceeded its time budget |
| `unavailable` grey | Source is not installed (Grype only) |

Click **Rescan** to force a fresh scan across all sources for the selected project.

### Findings Table

| Column | Description |
|--------|-------------|
| **Type** | vulnerability / integrity / secret / license / config |
| **Package** | `name@version` for dependency findings; `—` for file-based findings |
| **Title** | Advisory title or rule description |
| **Severity** | critical / high / medium / low / info |
| **Sources** | Badge for each source that reported this finding (e.g. `pnpm-audit` `grype`) |
| **Fix** | Runnable install command if known, or a link to the Patches page |

#### Multi-source badges

When more than one source reports the same vulnerability, all source names appear as badges in the **Sources** column. A finding confirmed by both `pnpm-audit` and `grype` is more reliable than one from a single source.

#### Reachability indicators

CVE Lite's `--usage` analysis annotates findings with:

- **`reachable`** (amber) — the package is detected as imported in your source code
- **`not imported`** (grey) — not detected as imported (best-effort; not used to hide findings)

#### Divergence warning

When two sources report the same advisory at severity levels that differ by more than one step (e.g. one says `high`, another says `low`), the finding is tagged **⚠ divergent**. This is informational — review both source reports if prioritizing remediation order matters.

---

## CVE Lite Dashboard

Available at `/security/cve-lite` in the sidebar. Per-project CVE triage powered by `cve-lite-cli`, backed by the [OSV database](https://osv.dev).

### Typical Triage Session

1. Select a project from the toolbar dropdown
2. Review the **Fix plan** — grouped by severity, each group shows the runnable install command
3. Check the **Findings** table for context on individual advisories
4. Apply fixes (see below), then click **Re-scan** to verify

### Toolbar

| Control | Description |
|---------|-------------|
| **Project dropdown** | Switch between managed projects |
| **scanned X ago** | Time since the most recent scan result was cached |
| **Re-scan** | Force a fresh scan (bypasses the 1-hour cache) |
| **imported only** | Client-side toggle — hides findings where the package was not detected as imported |
| **SBOM** | Downloads a CycloneDX JSON software bill of materials |
| **SARIF** | Downloads a SARIF file — import into the GitHub Security tab |
| **HTML report** | Opens the full `cve-lite` HTML report in a new browser tab |

### Scan Options

Options below the toolbar change what `cve-lite-cli` scans for. Any non-default selection shows a **live scan** amber indicator and bypasses the 1-hour cache.

| Option | What It Does |
|--------|-------------|
| **min severity** | Only report findings at or above this threshold (default: all) |
| **prod-only** | Exclude `devDependencies` from results |
| **only-used (scan)** | Pass `--only-used` to the CLI — restrict the scan itself to imported packages |
| **show all** | Pass `--all` — include all findings regardless of reachability |

`imported only` in the toolbar is a client-side filter applied after the scan; `only-used (scan)` in the options passes the flag to the CLI and changes what gets scanned.

### OSV Database Panel

Shows the age of the local OSV advisory database. Stale data produces inaccurate results.

| Control | Description |
|---------|-------------|
| **OSV DB: X ago** | When the database was last synced |
| **Sync DB** | Pull the latest advisories from OSV |
| **CI fails on: critical** | Informational — shows the `--fail-on` threshold used by `cve-lite-cli`; not enforced by HexOps |
| **install-skill** | Write Claude Code AI skill files into the selected project |

### Fix Plan

Groups all actionable fixes by severity (critical → low). Each group shows:
- The packages affected
- A runnable `npm install` / `pnpm add` command you can copy and run directly

**Fix all direct** — runs `cve-lite --fix` in the project directory, rewriting `package.json` and the lockfile in one step. A confirmation dialog appears before execution; a rescan runs automatically after. Restart the project's dev server if the fix changes runtime dependencies.

> Fix all direct only applies to direct dependencies. Transitive dependencies require the per-row Apply action.

### Findings Table

| Column | Description |
|--------|-------------|
| **Package** | Dependency name |
| **Version** | Currently installed version |
| **Severity** | critical / high / medium / low |
| **CVE IDs** | Advisory identifiers (OSV, CVE, GHSA) |
| **Fix Version** | Validated safe version from OSV |
| **Relationship** | direct / transitive |
| **Apply** | Route fix through the patch pipeline |

The **imported only** toolbar toggle filters this table client-side — it does not re-run the scan.

### Applying Individual Fixes

Click **Apply** on any row to route the fix through the same patch pipeline used by the Patches dashboard:

- **Direct dependencies** — runs `pnpm add pkg@<fix-version>` via the update route
- **Transitive dependencies** — injects a flat `pnpm.overrides` / npm `overrides` entry to pin the package without promoting it to a direct dependency

A confirmation dialog shows the exact version change before executing. A rescan runs automatically after each apply. You may need to restart the project's dev server if a runtime dependency changes.

> The **Apply** button and **Fix all direct** button are only shown when `AUTO_APPLY_ENABLED=true` in the HexOps environment. When the flag is off, use the install commands from the Fix plan or apply via the Patches page manually.

### AI Skill Files

**install-skill** runs `cve-lite install-skill` in the selected project directory, writing Claude Code and AI assistant integration files. This enables `/cve-lite` slash command support in that project's AI workflow.

---

## Code Security Scanner

Scans source files for security issues using grep-based PCRE rules. No external tools or API calls required.

### Running a Scan
Open any project → **Code Security** section → **Run Scan**

### Rules

| Rule ID | Category | Severity | What It Catches |
|---------|----------|----------|-----------------|
| `hardcoded-api-key` | secrets | critical | `api_key = "abc..."` patterns |
| `hardcoded-password` | secrets | critical | `password = "..."` patterns |
| `hardcoded-token` | secrets | critical | Access/auth/bearer token assignments |
| `aws-key` | secrets | critical | `AKIA...` AWS access key format |
| `private-key` | secrets | critical | PEM private key headers |
| `hardcoded-secret` | secrets | high | `secret = "..."`, `jwt_secret = "..."` |
| `eval-usage` | dangerous-api | high | `eval(...)` in JS/TS files |
| `dangerous-innerhtml` | dangerous-api | medium | `dangerouslySetInnerHTML={{__html:...}}` |
| `innerhtml-assign` | injection | medium | `.innerHTML = <dynamic>` |
| `document-write` | dangerous-api | medium | `document.write(...)` |
| `exec-with-template` | injection | high | `` exec(`...${var}`) `` |
| `execsync-with-template` | injection | high | `` execSync(`...${var}`) `` |
| `md5-usage` | weak-crypto | medium | MD5 hash usage |
| `sha1-usage` | weak-crypto | medium | SHA-1 hash usage |
| `math-random-security` | weak-crypto | high | `Math.random()` near token/secret/key |
| `cors-wildcard` | misconfiguration | medium | `Access-Control-Allow-Origin: *` |
| `http-only-false` | misconfiguration | medium | `httpOnly: false` cookies |
| `debug-true` | misconfiguration | low | `debug: true` in config |
| `log-password` | data-exposure | high | `console.log(...password...)` |

### Suppressing Rules

Create a `.hexops-ignore` file in the project root with one rule ID per line:

```
# This file is read by HexOps code and supply chain scanners
hardcoded-api-key
debug-true
```

### Scanned File Types
`.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.env`, `.json`, `.yaml`, `.yml`, `.sh`

### Excluded Directories
`node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `coverage`

---

## Supply Chain Scanner

Detects risks that `npm audit` misses — package takeovers, typosquats, and suspicious install scripts.

### Running a Scan
Open any project → **Supply Chain** section → **Run Scan**

### Detection Layers

#### 1. Typosquat Detection
Compares every direct dependency name against 60+ popular package names using Levenshtein distance:
- Edit distance 1 on names ≥ 4 chars → flagged as high severity
- Edit distance 2 on names ≥ 7 chars → flagged as high severity

Example: `lodahs` (distance 1 from `lodash`) → flagged.

#### 2. npm Audit Signatures
Runs `npm audit signatures` (npm projects only) to detect packages whose registry signatures don't match the published manifest — a sign of a tampered package.

#### 3. Install Script Detection
Scans `node_modules/*/package.json` for `preinstall`, `install`, `postinstall`, and `prepare` hooks in packages that shouldn't need them.

A whitelist of ~50 packages that legitimately use install scripts (esbuild, sharp, prisma, node-pty, etc.) are excluded automatically.

Severity:
- Direct dependency with install script → **medium**
- Transitive dependency with install script → **low**

### Findings Display
Results are grouped by severity (high / medium / low) with collapsible rows showing package name, version, finding type, and detail.
