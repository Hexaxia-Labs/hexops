import { NextRequest } from 'next/server';
import { getProjects, getCategories } from '@/lib/config';
import { readPatchState, readProjectCache } from '@/lib/patch-storage';
import { scanProject, buildPriorityQueue } from '@/lib/patch-scanner';
import type { ProjectPatchCache, ActiveOverride } from '@/lib/types';
import { mapWithConcurrency } from '@/lib/concurrency';

interface ProjectOverride extends ActiveOverride {
  projectId: string;
  projectName: string;
}

function collectOverrides(caches: ProjectPatchCache[], projectMap: Record<string, string>): ProjectOverride[] {
  const result: ProjectOverride[] = [];
  for (const cache of caches) {
    if (!cache.activeOverrides?.length) continue;
    const projectName = projectMap[cache.projectId] || cache.projectId;
    for (const o of cache.activeOverrides) {
      result.push({ ...o, projectId: cache.projectId, projectName });
    }
  }
  return result;
}

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function sseEvent(data: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1';

  const allProjects = getProjects();
  const categories = getCategories();
  const state = readPatchState();

  const projectMap: Record<string, string> = {};
  const projectCategories: Record<string, string> = {};
  const holdsMap: Record<string, string[]> = {};
  for (const project of allProjects) {
    projectMap[project.id] = project.name;
    projectCategories[project.id] = project.category;
    if (project.holds && project.holds.length > 0) {
      holdsMap[project.id] = project.holds;
    }
  }

  // Fast path: if all caches are valid and not forcing, skip SSE and return directly
  if (!force) {
    const allCached = allProjects.every(p => readProjectCache(p.id) !== null);
    if (allCached) {
      const caches = allProjects
        .map(p => readProjectCache(p.id))
        .filter((c): c is ProjectPatchCache => c !== null);

      const { queue, summary } = buildPriorityQueue(caches, projectMap, holdsMap);
      const activeOverrides = collectOverrides(caches, projectMap);

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent({
            type: 'complete',
            queue,
            summary,
            lastScan: state.lastFullScan,
            projectCount: allProjects.length,
            categories,
            projectCategories,
            projectNames: projectMap,
            activeOverrides,
          }));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-store',
          'Connection': 'keep-alive',
        },
      });
    }
  }

  // Streaming path: scan projects concurrently (limit 5), emit progress events
  const stream = new ReadableStream({
    async start(controller) {
      const total = allProjects.length;
      let completed = 0;

      const caches = await mapWithConcurrency(
        allProjects,
        5,
        async (project) => {
          if (request.signal.aborted) return null;
          try {
            return await scanProject(project, force);
          } catch (err) {
            console.error(`Failed to scan project ${project.id}:`, err);
            return null;
          }
        },
        (index) => {
          if (request.signal.aborted) return;
          completed++;
          controller.enqueue(sseEvent({
            type: 'progress',
            projectId: allProjects[index].id,
            projectName: allProjects[index].name,
            scanned: completed,
            total,
          }));
        },
      );

      if (request.signal.aborted) {
        controller.close();
        return;
      }

      const validCaches = caches.filter((c): c is ProjectPatchCache => c !== null);
      const { queue, summary } = buildPriorityQueue(validCaches, projectMap, holdsMap);
      const activeOverrides = collectOverrides(validCaches, projectMap);

      controller.enqueue(sseEvent({
        type: 'complete',
        queue,
        summary,
        lastScan: state.lastFullScan,
        projectCount: allProjects.length,
        categories,
        projectCategories,
        projectNames: projectMap,
        activeOverrides,
      }));

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
    },
  });
}
