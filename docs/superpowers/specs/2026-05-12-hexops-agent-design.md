---
title: HexOps Agent
date: 2026-05-12
status: approved
---

# HexOps Agent — Design Spec

A single `/hexops` Claude Code slash command that acts as a knowledgeable dev partner and patching workflow guide. Gitignored — not part of the committed codebase.

## Goals

- Provide context-aware dev assistance: feature planning, debugging, code review, architecture questions
- Guide patching operations: triage, escalation decisions, known failure modes
- Maintain light session memory across invocations

## Non-Goals

- Not a multi-agent hierarchy (no sub-commands, no specialist agents)
- Not a dashboard chat UI (that is HexOps Agent Phase 2 — a separate roadmap item)
- No TypeScript build step or compiled modules

---

## File Structure

```
hexops/
├── .claude/
│   ├── commands/
│   │   └── hexops.md          ← slash command definition (gitignored)
│   └── memory/
│       ├── context.md         ← version, WIP, active branch
│       ├── issues.md          ← open P0/P1 bugs and known failure modes
│       └── decisions.md       ← architectural choices and rationale
└── .gitignore                 ← .claude/commands/ and .claude/memory/ added
```

`.claude/settings.local.json` is already gitignored. Commands and memory follow the same convention.

---

## Session Start Protocol

On `/hexops` invocation, in order:

1. Run `date` — establish current date/time
2. Read `.claude/memory/context.md`, `issues.md`, `decisions.md` (gracefully skip if absent)
3. Read `TASKS.md` — open/in-progress items
4. Read top of `CHANGELOG.md` — current version
5. Greet: state version, active WIP (if any), open P0/P1 issues, ask how to help

**Example opening:**
> "Good afternoon. HexOps v0.14.0. Active WIP: none. Open issues: 1 P0 (false-positive patch success for nested deps — #80). What are we working on?"

If memory files are absent, greet is minimal: state version, ask how to help.

---

## Dev Assistance

### Codebase Knowledge

The agent carries working knowledge of:

| Area | Details |
|------|---------|
| **Stack** | Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, xterm.js + node-pty, Recharts, `@modelcontextprotocol/sdk` |
| **Source layout** | `src/app/api/` — route handlers; `src/components/` — UI; `src/lib/` — shared utilities; `src/mcp/` — 16 MCP tools; `src/contexts/` — React context providers |
| **Patching internals** | Override-aware patching, downgrade guard, `verifyAuditClear`, escalate/triage mode, cross-project collateral detection, package holds |
| **Existing specs** | Reads `docs/superpowers/specs/` and `docs/superpowers/plans/` before proposing changes — avoids re-solving solved problems |

### Behavior

- **New features** → invoke `superpowers:brainstorming`, then `superpowers:writing-plans`
- **Bugs** → invoke `superpowers:systematic-debugging`
- **Code review** → invoke `superpowers:requesting-code-review`
- Does not generate code unprompted — frames the problem, plans, then acts on confirmation

---

## Patching Workflow Guidance

The agent knows the known failure modes documented in `PATCHING_HEALTH_REPORT.md`:

| Failure Mode | Pattern | Correct Response |
|---|---|---|
| False-positive patch success | Override applied, nested copy still vulnerable | Re-run `npm audit --json`, confirm advisory ID cleared |
| EOVERRIDE crash | Package in both `devDependencies` and `overrides` | Delete devDep before writing flat override |
| Downgrade guard bypass | `currentVersion` empty when installed > package.json range | Read `node_modules/<pkg>/package.json` for installed version |
| "Looks installed" false success | stdout contains `up to date` with no actual change | Read node_modules version after install, compare |
| git push non-fast-forward | Dependabot merge between commit and push | `git pull --rebase --autostash`, retry push |

### Patch Triage Flow

When running patch ops, the agent walks through:

1. **Scan** — identify vulnerabilities and outdated packages
2. **Prioritize** — P0 CVEs first, then severity rank
3. **Apply** — direct update vs. override vs. escalate/triage vs. hold
4. **Verify** — `verifyAuditClear` confirms advisory ID gone, not just top-level version
5. **Commit/push** — auto-commit with rebase guard
6. **Collateral check** — scan other projects for downgrades of the same package

The agent flags when a user action matches a known failure pattern before it's executed.

---

## Memory System

Three files, all optional. The agent works without them; they improve session continuity.

### `context.md`
```markdown
# HexOps Context
**Version**: x.y.z
**Branch**: main
**WIP**: <description of active work, or "none">
**Last updated**: YYYY-MM-DD
```

### `issues.md`
```markdown
# Open Issues

## P0
- **#80** — False-positive patch success for nested transitive deps (fixViaOverride path). Fix: re-run audit and confirm advisory ID cleared.

## P1
- ...
```

### `decisions.md`
```markdown
# Architectural Decisions

## Override-Aware Patching
<why flat overrides are required for nested transitive deps, not just devDep bumps>

## node-pty over alternatives
<why node-pty + xterm.js was chosen for the PTY shell>
```

**Session end**: update whichever files changed. No rigid protocol — if something important was decided or discovered, write it down.

---

## Gitignore

`.claude/` is already in `.gitignore` — no changes needed. All files under `.claude/commands/` and `.claude/memory/` are automatically excluded.
