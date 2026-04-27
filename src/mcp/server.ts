#!/usr/bin/env node
/**
 * HexOps MCP Server
 *
 * Exposes HexOps project management capabilities as MCP tools.
 * Requires HexOps to be running (default: http://localhost:3000).
 *
 * Usage:
 *   pnpm mcp          — stdio transport (for Claude Code)
 *   HEXOPS_URL=http://localhost:3001 pnpm mcp
 *
 * Register with Claude Code:
 *   claude mcp add hexops -- npx tsx src/mcp/server.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = process.env.HEXOPS_URL ?? 'http://localhost:3000';

async function api(path: string, opts?: RequestInit) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HexOps API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function post(path: string, body?: unknown) {
  return api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

function text(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all registered HexOps projects with their current status (running/stopped), port, category, and path.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_project_status',
    description: 'Get detailed status for a single project including process metrics, git info, and Vercel deployment state.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'start_project',
    description: 'Start a project\'s dev server.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        mode: { type: 'string', enum: ['dev', 'prod'], description: 'Start mode (default: dev)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'stop_project',
    description: 'Stop a running project.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'scan_patches',
    description: 'Scan one or all projects for outdated packages and vulnerability advisories.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Scan a specific project (omit to scan all)' },
      },
      required: [],
    },
  },
  {
    name: 'get_vulnerabilities',
    description: 'Get current vulnerability advisories for a project from the patch cache.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'apply_patches',
    description: 'Apply package updates to a project. Specify packages or apply all pending updates.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        packages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Package names to update (omit to update all pending)',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_patch_history',
    description: 'Get patch history, optionally filtered to a specific project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Filter to specific project (optional)' },
        limit: { type: 'number', description: 'Max entries to return (default: 20)' },
      },
      required: [],
    },
  },
  {
    name: 'hold_package',
    description: 'Put a package on hold (prevent it from being patched automatically).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        package_name: { type: 'string', description: 'Package name to hold' },
        reason: { type: 'string', description: 'Reason for hold (optional)' },
      },
      required: ['project_id', 'package_name'],
    },
  },
  {
    name: 'git_status',
    description: 'Get git status for a project: branch, dirty state, ahead/behind counts, last commit.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'git_commit',
    description: 'Stage all changes and create a commit in a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        message: { type: 'string', description: 'Commit message' },
      },
      required: ['project_id', 'message'],
    },
  },
  {
    name: 'git_push',
    description: 'Push commits to remote for a project.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'git_pull',
    description: 'Pull latest changes from remote for a project.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_logs',
    description: 'Get structured activity logs for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        limit: { type: 'number', description: 'Max log entries (default: 50)' },
        category: { type: 'string', description: 'Filter by category (e.g. patch, git, process)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'clear_cache',
    description: 'Clear node_modules and package lock for a project (full reinstall trigger).',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_system_metrics',
    description: 'Get system-level metrics: CPU, memory, disk usage, and per-project process stats.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

const server = new Server(
  { name: 'hexops', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'list_projects': {
        const projects = await api('/api/projects');
        return text(projects);
      }

      case 'get_project_status': {
        const { project_id } = args as { project_id: string };
        const [projects, metrics, git] = await Promise.allSettled([
          api('/api/projects'),
          api(`/api/projects/${project_id}/metrics`),
          api(`/api/projects/${project_id}/git`),
        ]);
        const project = projects.status === 'fulfilled'
          ? (projects.value as Array<{ id: string }>).find((p) => p.id === project_id)
          : null;
        return text({
          project,
          metrics: metrics.status === 'fulfilled' ? metrics.value : null,
          git: git.status === 'fulfilled' ? git.value : null,
        });
      }

      case 'start_project': {
        const { project_id, mode = 'dev' } = args as { project_id: string; mode?: string };
        const result = await post(`/api/projects/${project_id}/start`, { mode });
        return text(result);
      }

      case 'stop_project': {
        const { project_id } = args as { project_id: string };
        const result = await post(`/api/projects/${project_id}/stop`);
        return text(result);
      }

      case 'scan_patches': {
        const { project_id } = args as { project_id?: string };
        if (project_id) {
          const result = await post(`/api/patches/scan`, { projectId: project_id });
          return text(result);
        }
        const result = await post('/api/patches/scan');
        return text(result);
      }

      case 'get_vulnerabilities': {
        const { project_id } = args as { project_id: string };
        const result = await api(`/api/projects/${project_id}/audit`);
        return text(result);
      }

      case 'apply_patches': {
        const { project_id, packages } = args as { project_id: string; packages?: string[] };
        const result = await post(`/api/projects/${project_id}/update`, {
          packages: packages ?? [],
          mode: 'auto',
        });
        return text(result);
      }

      case 'get_patch_history': {
        const { project_id, limit = 20 } = args as { project_id?: string; limit?: number };
        const qs = project_id ? `?projectId=${project_id}&limit=${limit}` : `?limit=${limit}`;
        const result = await api(`/api/patches/history${qs}`);
        return text(result);
      }

      case 'hold_package': {
        const { project_id, package_name, reason } = args as { project_id: string; package_name: string; reason?: string };
        const result = await post(`/api/projects/${project_id}/holds`, {
          action: 'add',
          package: package_name,
          reason,
        });
        return text(result);
      }

      case 'git_status': {
        const { project_id } = args as { project_id: string };
        const result = await api(`/api/projects/${project_id}/git`);
        return text(result);
      }

      case 'git_commit': {
        const { project_id, message } = args as { project_id: string; message: string };
        const result = await post(`/api/projects/${project_id}/git-commit`, { message });
        return text(result);
      }

      case 'git_push': {
        const { project_id } = args as { project_id: string };
        const result = await post(`/api/projects/${project_id}/git-push`);
        return text(result);
      }

      case 'git_pull': {
        const { project_id } = args as { project_id: string };
        const result = await post(`/api/projects/${project_id}/git-pull`);
        return text(result);
      }

      case 'get_logs': {
        const { project_id, limit = 50, category } = args as { project_id: string; limit?: number; category?: string };
        const qs = new URLSearchParams({ limit: String(limit) });
        if (category) qs.set('category', category);
        const result = await api(`/api/projects/${project_id}/logs?${qs}`);
        return text(result);
      }

      case 'clear_cache': {
        const { project_id } = args as { project_id: string };
        const result = await post(`/api/projects/${project_id}/clear-cache`);
        return text(result);
      }

      case 'get_system_metrics': {
        const result = await api('/api/system/metrics');
        return text(result);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

// Resources: expose project list and current patch state as context
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'hexops://projects',
      mimeType: 'application/json',
      name: 'Projects',
      description: 'All registered HexOps projects with status and configuration',
    },
    {
      uri: 'hexops://patches',
      mimeType: 'application/json',
      name: 'Patch State',
      description: 'Current vulnerability and outdated package state across all projects',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  try {
    if (uri === 'hexops://projects') {
      const data = await api('/api/projects');
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    }
    if (uri === 'hexops://patches') {
      const data = await api('/api/patches');
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown resource: ${uri}`);
  } catch (err) {
    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text: `Error reading resource: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
