# HexOps

**Stop juggling terminal tabs. One dashboard for all your projects.**

Manage 5, 15, or 50+ local dev projects from a single web interface. Start/stop servers, batch-patch vulnerabilities, monitor system health, and deploy to Vercel without touching a terminal.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.20.0-green.svg)
![Node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)

---

## The Problem

You have 15 local projects. A critical CVE drops. Now you need to:

1. `cd project-a && pnpm audit && pnpm update && git commit...`
2. Repeat 14 more times.
3. Miss one. Find out the hard way.

Or you could open HexOps and patch all 15 in 5 minutes.

---

## What It Does

| Feature | What You Get |
|---------|-------------|
| **Project Dashboard** | See all projects in one view. Start/stop dev servers. View git branch, port, uptime, memory. Autostart flagged projects on boot. |
| **Patch Scanner** | Scan every project for vulnerabilities and outdated packages. Concurrent scanning (5 projects at a time). Batch update with one click. Post-patch audit verifies advisories are actually gone. |
| **Override-Aware Patching** | Automatically detects transitive deps, applies `pnpm.overrides` / `npm overrides`, cleans stale overrides after direct dep updates. |
| **Escalate / Triage Mode** | When a patch can't land cleanly: force-override, force-major bump, or accept-risk with expiry. Downgrade guards on all paths. |
| **Package Holds** | Skip packages that break things (per-project). ESLint major upgrade? Hold it until you're ready. |
| **Cross-Project Integrity** | After any patch, checks all other projects for collateral downgrades of the same package. Fires a notification if found. |
| **Dependency Graph** | Visualize shared packages across all projects. Bar chart of top 20 most-shared packages, color-coded by vulnerability status. |
| **Code Security Scanner** | 16 grep-based PCRE rules — hardcoded secrets, dangerous APIs, command injection, weak crypto, misconfigurations. Supports `.hexops-ignore`. |
| **CVE Lite** | OSV-backed dependency remediation (an OWASP project). Per-project scan with severity filters, fix plan, SBOM/SARIF export. Apply fixes directly or via the patch pipeline. *(Early access — security features are actively evolving.)* |
| **Supply Chain Scanner** | Detects install scripts, invalid npm signatures, and typosquatted package names via Levenshtein distance. |
| **Notifications** | In-app notification bell for security events, crashes, and patch results. Optional webhook for critical alerts. |
| **Scheduler** | Configurable background tasks: auto patch-scan and health-check on cron-style intervals. |
| **Integrated Shell** | Full PTY terminal in the browser via xterm.js. No more "which tab was that?" |
| **System Health** | Real-time CPU, memory, disk gauges with color-coded thresholds. |
| **Git Controls** | View status, commit, push, pull, branch switch, and stash management from the UI. Auto-commit after patches. |
| **Vercel Deploy** | Deploy preview or production builds directly from the dashboard. Streaming build logs. Deployment history. |
| **Dependabot Integration** | Monitor mode for Dependabot-managed repos. Branch propagation syncs `package.json` and regenerates lockfiles after merges. |
| **MCP Server** | 16 tools exposing HexOps APIs to Claude Code and any MCP-compatible client. Register with `claude mcp add hexops`. |
| **Centralized Logs** | JSON Lines format. Filter by level, category, project. Live mode with auto-refresh. |
| **Per-Project Settings** | Environment vars, Node version overrides, shell selection, deploy config, monitoring. |

---

## Real Numbers

We use HexOps daily to manage 32 projects across 4 categories:

| Metric | Value |
|--------|-------|
| Projects managed | 32 |
| Categories | Client, Internal, Personal, Product |
| Packages scanned per run | 97+ outdated across 22 projects |
| Time to patch all projects | ~5 minutes (vs ~2 hours manually) |
| GitHub issues resolved | 87 (all closed) |
| Patch edge cases handled | npm ERESOLVE, pnpm soft-failures, arborist errors, lockfile corruption, transitive dep overrides, collateral downgrades |

---

## Screenshots

### Dashboard
32 projects at a glance. System health gauges, git status, package counts, start/stop any server with one click.

![Dashboard](screenshots/dashboard.png)

### Patch Scanner
97 outdated packages across 22 projects. Severity-ranked priority queue. Batch select, update, commit, push. Hold packages that break things.

![Patches](screenshots/patches.png)

### Activity Logs
Every operation logged with timestamps, levels, and categories. Filter by project, search, or watch live.

![Logs](screenshots/logs.png)

---

## How It Compares

| | HexOps | pm2 | Portainer | Renovate/Dependabot | Manual Terminals |
|--|:------:|:---:|:---------:|:-------------------:|:----------------:|
| Web dashboard | Yes | No (CLI) | Yes | No | No |
| Multi-repo management | Yes | Limited | Docker only | Yes (CI) | Manual |
| Vulnerability scanning | Yes | No | No | Yes | Manual |
| Batch patching | Yes | No | No | PR-based | Manual |
| Override-aware patching | Yes | No | No | Limited | No |
| Post-patch audit verify | Yes | No | No | No | Manual |
| Supply chain scanning | Yes | No | No | No | No |
| OSV/CVE remediation (CVE Lite) | Yes *(evolving)* | No | No | Limited | No |
| Code security scanning | Yes | No | No | No | No |
| Package holds | Yes | No | No | No | N/A |
| Integrated terminal | Yes | No | Yes | No | N/A |
| System health monitoring | Yes | Yes | Yes | No | Manual |
| Git integration | Yes | No | No | Yes | Manual |
| Vercel deploy | Yes | No | No | No | CLI |
| MCP server | Yes | No | No | No | No |
| No containers required | Yes | Yes | No | Yes | Yes |
| Local-first (no CI needed) | Yes | Yes | No | No | Yes |

---

## Quick Start

```bash
# Clone
git clone https://github.com/Hexaxia-Technologies/hexops.git
cd hexops

# Install
pnpm install

# Configure
cp hexops.config.example.json hexops.config.json
# Edit hexops.config.json — add your project paths

# Run
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Minimal Config

```json
{
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "path": "/home/you/projects/my-app",
      "port": 3001,
      "category": "Product",
      "scripts": { "dev": "pnpm dev" }
    }
  ],
  "categories": ["Product", "Client", "Internal"]
}
```

Add as many projects as you want. HexOps scans them all.

### MCP Server (Claude Code)

Expose HexOps as MCP tools to Claude Code and other AI clients:

```bash
# Register with Claude Code (HexOps must be running)
claude mcp add hexops -- npx tsx src/mcp/server.ts

# Or with a custom URL
HEXOPS_URL=http://localhost:3001 claude mcp add hexops -- npx tsx src/mcp/server.ts
```

Available tools: `list_projects`, `start_project`, `stop_project`, `scan_patches`, `apply_patches`, `get_vulnerabilities`, `git_status`, `git_commit`, `git_push`, `get_logs`, and more.

---

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** + **shadcn/ui** + **Radix UI**
- **xterm.js** + **node-pty** (WebSocket-driven PTY shell)
- **Recharts** (data visualization)
- **@modelcontextprotocol/sdk** (MCP server)
- **Custom server** (WebSocket for shell + HMR co-existence)

## Requirements

- Node.js 20+
- pnpm 9+
- Git

---

## Documentation

| Doc | What's In It |
|-----|-------------|
| [Getting Started](docs/getting-started.md) | Installation, config, first run |
| [Configuration](docs/configuration.md) | Full JSON config schema reference |
| [Architecture](docs/development/architecture.md) | System design, data flow, API reference |
| [Features](docs/features/) | Per-feature deep dives |

---

## Security

> **HexOps is designed for local use only. Never expose it to the internet.**

HexOps provides full shell access and process control. These are powerful features for local development that would be dangerous if exposed publicly. Always run on `localhost`. If you need remote access, use SSH tunneling or a VPN.

---

## Roadmap

### Completed (v0.20.0)
- [x] CVE Lite dashboard — OSV-backed per-project CVE triage, fix plan, SBOM/SARIF export
- [x] Concurrent patch scanning — 5 projects in parallel, 10s registry timeout (was serial 30s)
- [x] Server-side auto-apply gate — all mutation endpoints return 409 when disabled
- [x] Fleet-wide postcss CVE remediation tooling

### Completed (v0.13.0)
- [x] MCP server for Claude Code integration — 16 tools, stdio transport
- [x] Static code security scanner — 16 grep-based PCRE rules
- [x] Supply chain scanner — install scripts, signatures, typosquats
- [x] Post-patch audit verification — confirms advisory actually cleared
- [x] Cross-project collateral downgrade detection
- [x] Override-aware patching with stale override cleanup
- [x] Escalate / triage mode — force-override, force-major, accept-risk
- [x] Dependabot integration and branch propagation
- [x] Dependency graph visualization
- [x] Notifications system with webhook support
- [x] Background task scheduler
- [x] Vercel deployment history and streaming build logs
- [x] Branch switcher and stash management in git UI
- [x] Patch trends dashboard

### Planned
- [ ] Supply Chain Attack Detection — dependency confusion, compromised maintainer detection, protestware patterns *(next security milestone)*
- [ ] Pre-patch build validation in isolated worktree
- [ ] CVE Lite: preview resolved-tree delta before applying overrides
- [ ] HexOps Agent — dashboard chat UI (Phase 2 of MCP)
- [ ] Multi-user mode with auth
- [ ] Docker image for instant setup

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## About

Built by [Hexaxia Technologies](https://hexaxia.tech). We manage 32 projects with HexOps every day. It's the tool we wished existed, so we built it.

## License

MIT - see [LICENSE](LICENSE).
