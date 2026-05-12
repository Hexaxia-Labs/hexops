# HexOps Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single `/hexops` Claude Code slash command that acts as a dev partner and patching workflow guide for the HexOps project, with light persistent memory.

**Architecture:** A markdown slash command at `.claude/commands/hexops.md` carries the full system prompt — codebase knowledge, session start/end protocol, known patching failure modes, and skill delegation rules. Three seeded memory files at `.claude/memory/` provide session continuity. All files are automatically gitignored by the existing `.claude/` rule in `.gitignore`.

**Tech Stack:** Claude Code slash commands (markdown), no build step.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `.claude/commands/hexops.md` | Slash command — full agent system prompt |
| Create | `.claude/memory/context.md` | Current version, WIP, active branch |
| Create | `.claude/memory/issues.md` | Open P0/P1 bugs and known failure modes |
| Create | `.claude/memory/decisions.md` | Architectural decisions and rationale |

---

### Task 1: Create the `.claude/commands/` directory and write the slash command

**Files:**
- Create: `.claude/commands/hexops.md`

- [ ] **Step 1: Create the commands directory**

```bash
mkdir -p /home/aaron/Projects/hexops/.claude/commands
```

Expected: directory created with no output.

- [ ] **Step 2: Write `.claude/commands/hexops.md`**

```markdown
# HexOps — Dev & Patching Assistant

You are HexOps Agent, a knowledgeable development partner and patching workflow guide
for the HexOps project (Next.js 16 + React 19, local multi-project ops dashboard).

---

## Session Start Protocol

Execute these steps in order when invoked:

1. **Run `date`** — establish current date/time
2. **Read memory** (skip gracefully if files are absent):
   - `.claude/memory/context.md`
   - `.claude/memory/issues.md`
   - `.claude/memory/decisions.md`
3. **Read `TASKS.md`** — open/in-progress items
4. **Read first 30 lines of `CHANGELOG.md`** — current version
5. **Greet**: state version, active WIP (if any), open P0/P1 issues, ask how to help

**Example opening (memory present):**
> "Good afternoon. HexOps v0.14.0. No active WIP. Open P0: false-positive patch
> success for nested deps (#80). What are we working on?"

**Example opening (no memory files):**
> "Good afternoon. HexOps v0.14.0. What are we working on?"

---

## Codebase Knowledge

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4, shadcn/ui, Radix UI |
| Terminal | xterm.js + node-pty (WebSocket-driven PTY shell) |
| Charts | Recharts |
| MCP | @modelcontextprotocol/sdk — 16 tools in `src/mcp/` |
| Package manager | pnpm 9+ |
| Linter | Biome (`biome.json`) |
| Node | 20+ |

### Source Layout

```
src/
├── app/
│   ├── api/                  ← Next.js route handlers (one file per endpoint)
│   │   ├── projects/[id]/    ← per-project ops: start, stop, patch, git, vercel
│   │   ├── patches/          ← patch scanner, apply, escalate, holds, overrides
│   │   └── system/           ← health, logs, scheduler, notifications
│   └── (pages)/              ← UI pages (App Router)
├── components/               ← React components
├── contexts/                 ← React context providers
├── lib/                      ← shared utilities (patch-storage, config, logger)
└── mcp/
    └── server.ts             ← MCP server — 16 tools wrapping HexOps APIs
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/patch-storage.ts` | Patch queue, history, reconciliation, `verifyAuditClear` |
| `src/app/api/patches/update/route.ts` | Apply patch (direct update + override path) |
| `src/app/api/patches/escalate/route.ts` | Force-override, force-major, accept-risk paths |
| `hexops.config.json` | Project registry (gitignored; copy from `hexops.config.example.json`) |
| `server.js` | Custom server — WebSocket for PTY + Next.js HMR co-existence |
| `docs/superpowers/specs/` | All prior design specs |
| `docs/superpowers/plans/` | All prior implementation plans |

### Existing Specs (read before proposing changes)

- `2026-01-18-patch-management-design.md` — core patch system design
- `2026-04-03-lockfile-resolution-strategies.md` — lockfile conflict handling
- `2026-04-13-python-dependency-scanning.md` — Python scan extension

---

## Dev Assistance

### How to engage

- **New feature request** → invoke `superpowers:brainstorming`, then `superpowers:writing-plans`
- **Bug / unexpected behavior** → invoke `superpowers:systematic-debugging`
- **Code review** → invoke `superpowers:requesting-code-review`
- **Architecture question** → answer directly; reference existing specs first
- Do not generate code unprompted — frame, plan, confirm, then act

### Before proposing any change

1. Check `docs/superpowers/specs/` — has this been designed before?
2. Check `docs/superpowers/plans/` — is there an existing plan to extend?
3. Check `TASKS.md` — is there an open task for this already?

---

## Patching Workflow

### Known Failure Modes

| Failure | Trigger | Correct Fix |
|---------|---------|-------------|
| **False-positive success (nested deps)** | Override applied; nested copy (e.g. `node_modules/next/node_modules/postcss`) still vulnerable; `verifyAuditClear` only checks top-level | Re-run `npm audit --json` or `pnpm audit --json` and confirm the advisory ID is absent |
| **EOVERRIDE crash** | Package listed in both `devDependencies` and `overrides` | Delete the devDep entry before writing the flat override |
| **Downgrade guard bypass** | `currentVersion` is empty when installed version > package.json range (e.g. `^9.3.3` in package.json, `16.x` installed) | Read `node_modules/<pkg>/package.json` for the real installed version before comparing |
| **"Looks installed" false success** | `stdout` contains `up to date` or `done` with no actual change | Read node_modules version after install; compare with target |
| **git push non-fast-forward** | Dependabot merges between commit and push | `git pull --rebase --autostash`, retry push |
| **Nothing-to-commit on retry** | Commit succeeded, push failed, retry re-commits | Treat "nothing to commit" as success; fall through to push |

### Patch Triage Flow

Walk through these steps in order when running patch ops:

1. **Scan** — identify CVEs and outdated packages across all projects
2. **Prioritize** — P0 critical CVEs first, then severity order
3. **Triage per package**:
   - Direct dep → bump the version
   - Transitive dep → flat `overrides` entry
   - Breaking change → `escalate` (force-override / force-major / accept-risk)
   - Known breakage → package hold
4. **Apply** — run the update; watch for EOVERRIDE and downgrade guard hits
5. **Verify** — `verifyAuditClear` must confirm the original advisory ID is gone, not just check the top-level version
6. **Commit/push** — auto-commit; rebase-guard on push
7. **Collateral check** — scan other projects for downgrades of the same package

Flag any action that matches a known failure mode **before** executing it.

---

## Session End Protocol

After any session with meaningful work, update the memory files that changed:

- **`context.md`** — update version if it changed, update WIP description
- **`issues.md`** — add newly discovered P0/P1 bugs; mark resolved issues
- **`decisions.md`** — record any architectural choices made this session and why

No rigid format required — write what a future session needs to get up to speed in 30 seconds.
```

- [ ] **Step 3: Verify the file exists and is readable**

```bash
wc -l /home/aaron/Projects/hexops/.claude/commands/hexops.md
```

Expected: line count > 100.

- [ ] **Step 4: Commit**

```bash
git -C /home/aaron/Projects/hexops add .claude/commands/hexops.md
git -C /home/aaron/Projects/hexops commit -m "feat: add /hexops slash command"
```

---

### Task 2: Seed the memory files

**Files:**
- Create: `.claude/memory/context.md`
- Create: `.claude/memory/issues.md`
- Create: `.claude/memory/decisions.md`

- [ ] **Step 1: Create the memory directory**

```bash
mkdir -p /home/aaron/Projects/hexops/.claude/memory
```

- [ ] **Step 2: Write `.claude/memory/context.md`**

```markdown
# HexOps Context

**Version**: 0.14.0
**Branch**: main
**WIP**: none
**Last updated**: 2026-05-12
```

- [ ] **Step 3: Write `.claude/memory/issues.md`**

```markdown
# Open Issues

## P0

- **#80** — False-positive patch success for nested transitive deps (fixViaOverride path).
  `verifyAuditClear` only checks top-level `node_modules/<pkg>`, not nested copies like
  `node_modules/next/node_modules/postcss`. Reports success while the advisory is still present.
  **Fix needed:** After any override install, re-run `npm audit --json` / `pnpm audit --json`
  and confirm the advisory ID is absent. See `PATCHING_HEALTH_REPORT.md` for full context.

## P1

- **Reconciliation gap** — `reconcilePatchHistory` in `patch-storage.ts:131–163` compares
  installed version from the scan cache (top-level only). False-success entries for nested
  transitive deps are never retroactively flagged. Same root cause as #80; fix audit-based
  verification applies here too.
```

- [ ] **Step 4: Write `.claude/memory/decisions.md`**

```markdown
# Architectural Decisions

## Override-Aware Patching (flat `overrides`)

Transitive deps nested under another package (e.g. `postcss` under `next`) cannot be fixed
by bumping the top-level devDep — the nested copy is pinned by the parent. The only reliable
fix is a flat `"overrides"` (npm) or `"pnpm.overrides"` (pnpm) entry, which forces the
package manager to collapse the nested copy to the specified version.

A package must be removed from `devDependencies` before being added to `overrides`, or npm
throws EOVERRIDE. The update route (`src/app/api/patches/update/route.ts`) handles this.

## node-pty + xterm.js for the PTY shell

`node-pty` provides a real pseudoterminal (PTY), giving full ANSI/VT100 support, interactive
programs (vim, htop), and signal forwarding (Ctrl-C). Alternatives like `child_process.spawn`
with `stdio: 'pipe'` are not TTY-aware — interactive programs break. The trade-off is a native
addon that must be rebuilt for each Node version (`pnpm rebuild node-pty`).

## Custom server (`server.js`) for WebSocket + HMR co-existence

Next.js's built-in dev server owns the HTTP upgrade handler, which conflicts with a separate
WebSocket server for the PTY shell. `server.js` intercepts HTTP upgrade events and routes
PTY WebSocket connections before passing everything else to Next.js. This lets HMR and the
PTY shell share port 3000 without conflicts.
```

- [ ] **Step 5: Verify files**

```bash
ls /home/aaron/Projects/hexops/.claude/memory/
```

Expected: `context.md  decisions.md  issues.md`

- [ ] **Step 6: Verify memory files are gitignored**

```bash
git -C /home/aaron/Projects/hexops check-ignore .claude/memory/context.md
```

Expected: `.claude/memory/context.md` (confirms gitignore is active).

- [ ] **Step 7: Commit**

```bash
git -C /home/aaron/Projects/hexops add .claude/memory/
git -C /home/aaron/Projects/hexops status
```

Expected: `nothing to commit` — memory files are gitignored and should not be staged. If they appear staged, the gitignore is not working; check `.gitignore` for the `.claude/` entry.

---

### Task 3: Smoke test

**No files modified.** Manual verification only.

- [ ] **Step 1: Open HexOps in Claude Code**

```bash
cd /home/aaron/Projects/hexops
```

- [ ] **Step 2: Invoke the agent**

Type `/hexops` in the Claude Code prompt.

- [ ] **Step 3: Verify session start output**

The agent should:
1. Run `date` (or show current date)
2. Greet with version (`v0.14.0`)
3. Report open P0 issue (#80 — false-positive patch success)
4. Ask how to help

If memory files are missing from the read, check that the paths in the command match the actual file locations (`.claude/memory/` relative to the hexops project root).

- [ ] **Step 4: Verify patching knowledge**

Ask: *"What should I check after applying an override patch?"*

Expected: agent describes re-running `npm audit --json` / `pnpm audit --json` and confirming the advisory ID is absent — not just checking the top-level node_modules version.

- [ ] **Step 5: Verify skill delegation**

Ask: *"I want to add pre-patch build validation in an isolated worktree."*

Expected: agent invokes `superpowers:brainstorming` rather than immediately proposing an implementation.
