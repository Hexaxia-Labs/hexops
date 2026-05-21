# Security Scanning

HexOps includes three complementary security layers. CVE Lite is available fleet-wide from the sidebar; the Code Security and Supply Chain scanners are available per-project from the project detail view.

> **Note:** Security features in HexOps are actively evolving. CVE Lite is early access — the scanning pipeline, fix workflows, and artifact formats may change between releases.

## CVE Lite Dashboard

OSV-backed dependency remediation — available at `/security/cve-lite` in the sidebar.

CVE Lite scans a project's dependencies against the [OSV database](https://osv.dev) (an OWASP project), providing structured vulnerability triage and fix guidance beyond what `npm audit` alone covers.

### Running a Scan

Select a project from the dropdown → scan runs automatically (cached 1 hour). Click **Rescan** to force a fresh scan.

### Scan Options

| Option | What It Does |
|--------|-------------|
| **Min Severity** | Filter findings below a threshold (low / medium / high / critical) |
| **Prod Only** | Exclude devDependencies from results |
| **Imported Only** | Show only packages with detected import usage in source code |
| **All** | Include all findings regardless of reachability |

Non-default options bypass the 1-hour cache and always trigger a fresh scan.

### Fix Plan

Groups actionable fixes by severity. Each group shows the runnable install command. The **Fix all direct** button runs `cve-lite --fix` to apply all direct-dependency fixes at once.

### Findings Table

| Column | Description |
|--------|-------------|
| Package | Dependency name |
| Version | Currently installed version |
| Severity | critical / high / medium / low |
| CVE IDs | Advisory identifiers (OSV, CVE, GHSA) |
| Fix Version | Validated safe version |
| Relationship | direct / transitive |
| Apply | Apply fix through the patch pipeline (transitive deps use `pm override`) |

### Artifacts

| Button | Output |
|--------|--------|
| **CycloneDX SBOM** | Software Bill of Materials in CycloneDX JSON format |
| **SARIF** | Static Analysis Results Interchange Format — import into GitHub Security tab |
| **Full Report** | Raw CVE Lite JSON output |

### OSV Database Management

The **Manage** panel shows your local OSV DB status (version, last sync). Use **Sync DB** to pull the latest advisories. The DB is shared across all project scans.

### AI Skill Files

**Install Skill** writes Claude Code and AI assistant integration files into the project directory, enabling `/cve-lite` slash command support in that project's AI workflow.

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
