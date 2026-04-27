# MCP Server

HexOps exposes its APIs as MCP (Model Context Protocol) tools, enabling Claude Code and other AI clients to manage projects via natural language.

## Setup

HexOps must be running before the MCP server can answer tool calls (it proxies to the HexOps HTTP API).

### Register with Claude Code

```bash
claude mcp add hexops -- npx tsx src/mcp/server.ts
```

With a custom port:

```bash
HEXOPS_URL=http://localhost:3001 claude mcp add hexops -- npx tsx src/mcp/server.ts
```

### Run directly

```bash
pnpm mcp
```

## Available Tools

### Project Management

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects with status, port, category, path |
| `get_project_status` | Detailed status: metrics, git info, Vercel deployment |
| `start_project` | Start a project's dev server (`mode: dev\|prod`) |
| `stop_project` | Stop a running project |

### Patch Operations

| Tool | Description |
|------|-------------|
| `scan_patches` | Scan one or all projects for vulnerabilities and outdated packages |
| `apply_patches` | Apply package updates to a project |
| `get_vulnerabilities` | Get current advisory details for a project |
| `get_patch_history` | Fetch patch history, optionally filtered by project |
| `hold_package` | Put a package on hold to prevent automatic patching |

### Git

| Tool | Description |
|------|-------------|
| `git_status` | Branch, dirty state, ahead/behind counts, last commit |
| `git_commit` | Stage all changes and create a commit |
| `git_push` | Push commits to remote |
| `git_pull` | Pull latest changes from remote |

### System

| Tool | Description |
|------|-------------|
| `get_logs` | Query structured logs with optional category filter |
| `clear_cache` | Clear node_modules for a project |
| `get_system_metrics` | CPU, memory, disk usage across all projects |

## Resources

Two MCP resources are exposed for context injection:

| URI | Contents |
|-----|----------|
| `hexops://projects` | All registered projects with status and config |
| `hexops://patches` | Current vulnerability and outdated package state |

## Example Interactions

```
# In Claude Code, with HexOps MCP registered:

"What projects are running?"
→ list_projects

"Patch all critical vulnerabilities in my-app"
→ scan_patches + apply_patches

"What's the git status of hexops?"
→ git_status {project_id: "hexops"}

"Commit and push the patch changes in my-app"
→ git_commit + git_push
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `HEXOPS_URL` | `http://localhost:3000` | URL of the running HexOps instance |
