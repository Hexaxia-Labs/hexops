'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ProjectList } from '@/components/project-list';
import { ProjectDetail } from '@/components/project-detail';
import { SystemHealth } from '@/components/system-health';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/types';

type SortBy = 'name' | 'status' | 'vulns';

interface PatchStatus {
  patched: number;
  unpatched: number;
  heldPackages: number;
  total: number;
}

type ViewMode = 'list' | 'detail';

function HomeContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [patchStatus, setPatchStatus] = useState<PatchStatus | null>(null);

  // Handle ?project=id query param to deep link to project detail
  useEffect(() => {
    const projectId = searchParams.get('project');
    if (projectId) {
      setDetailProjectId(projectId);
      setViewMode('detail');
    }
  }, [searchParams]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects').catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json();
      setProjects(data.projects || []);
      setCategories(data.categories || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPatchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/patches').catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json();

      if (data.queue !== undefined && data.projectCount !== undefined) {
        const total = data.projectCount;

        // Group patches by project and count held packages
        const patchesByProject: Record<string, number> = {};
        let heldPackages = 0;

        for (const patch of data.queue) {
          if (!patchesByProject[patch.projectId]) {
            patchesByProject[patch.projectId] = 0;
          }
          patchesByProject[patch.projectId]++;

          // Count total held packages
          if (patch.isHeld === true) {
            heldPackages++;
          }
        }

        // Get unique project IDs from projectCategories (all scanned projects)
        const projectIds = data.projectCategories
          ? Object.keys(data.projectCategories)
          : Object.keys(patchesByProject);

        // Count projects by patch status (simple: patched or unpatched)
        let patched = 0;
        let unpatched = 0;

        for (const projectId of projectIds) {
          const patchCount = patchesByProject[projectId] || 0;
          if (patchCount === 0) {
            patched++;
          } else {
            unpatched++;
          }
        }

        setPatchStatus({ patched, unpatched, heldPackages, total });
      }
    } catch (error) {
      console.error('Failed to fetch patch status:', error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchPatchStatus();
  }, [fetchProjects, fetchPatchStatus]);

  const handleStart = async (id: string) => {
    const project = projects.find(p => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}/start`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Starting ${project?.name || id}`, {
          description: `Port ${project?.port}`,
        });
      } else if (data.status === 'running' || data.error?.includes('already running')) {
        toast.success(`${project?.name || id} is already running`);
      } else {
        toast.error(`Failed to start ${project?.name || id}`, {
          description: data.error,
        });
        return;
      }

      // Poll until project is actually running (max 15 seconds)
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusRes = await fetch('/api/projects');
        const statusData = await statusRes.json();
        const updatedProject = statusData.projects?.find((p: Project) => p.id === id);
        if (updatedProject?.status === 'running') {
          setProjects(statusData.projects);
          setLastRefresh(new Date());
          return;
        }
      }
      fetchProjects();
    } catch (error) {
      toast.error(`Failed to start ${project?.name || id}`);
      console.error('Failed to start project:', error);
    }
  };

  const handleStop = async (id: string) => {
    const project = projects.find(p => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}/stop`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Stopped ${project?.name || id}`);
      } else {
        toast.error(`Failed to stop ${project?.name || id}`, {
          description: data.error,
        });
        return;
      }

      // Poll until project is actually stopped (max 10 seconds)
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusRes = await fetch('/api/projects');
        const statusData = await statusRes.json();
        const updatedProject = statusData.projects?.find((p: Project) => p.id === id);
        if (updatedProject?.status === 'stopped') {
          setProjects(statusData.projects);
          setLastRefresh(new Date());
          return;
        }
      }
      fetchProjects();
    } catch (error) {
      toast.error(`Failed to stop ${project?.name || id}`);
      console.error('Failed to stop project:', error);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedProjectId(id);
  };

  const handleViewLogs = (id: string) => {
    setSelectedProjectId(id);
    // TODO: Integrate with global shell/panel system
  };

  const handleClearCache = async (id: string) => {
    const project = projects.find(p => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}/clear-cache`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
      } else {
        toast.error(`Failed to clear cache for ${project?.name || id}`, {
          description: data.error,
        });
      }
    } catch (error) {
      toast.error(`Failed to clear cache for ${project?.name || id}`);
      console.error('Failed to clear cache:', error);
    }
  };

  const handleDeleteLock = async (id: string) => {
    const project = projects.find(p => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}/delete-lock`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
      } else {
        toast.error(`Failed to delete lock for ${project?.name || id}`, {
          description: data.error,
        });
      }
    } catch (error) {
      toast.error(`Failed to delete lock for ${project?.name || id}`);
      console.error('Failed to delete lock:', error);
    }
  };

  const handleViewDetails = (id: string) => {
    setDetailProjectId(id);
    setViewMode('detail');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setDetailProjectId(null);
  };

  const filteredProjects = projects
    .filter((project) => {
      if (selectedCategory !== null) {
        if (selectedCategory === 'running' && project.status !== 'running') return false;
        if (selectedCategory === 'stopped' && project.status !== 'stopped') return false;
        if (selectedCategory !== 'running' && selectedCategory !== 'stopped' && project.category !== selectedCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          project.name.toLowerCase().includes(q) ||
          (project.description ?? '').toLowerCase().includes(q) ||
          project.category.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'status') {
        const order = { running: 0, stopped: 1, unknown: 2 };
        return (order[a.status] ?? 2) - (order[b.status] ?? 2);
      }
      if (sortBy === 'vulns') {
        const va = (a.extended?.packages?.vulnerabilityCount ?? 0);
        const vb = (b.extended?.packages?.vulnerabilityCount ?? 0);
        return vb - va;
      }
      return a.name.localeCompare(b.name);
    });

  // Get detail project - keep previous project data during refreshes to prevent
  // the detail view from unmounting/remounting while polling or during HMR
  const detailProjectRef = useRef<Project | null>(null);
  const detailProjectFromList = viewMode === 'detail' && detailProjectId
    ? projects.find(p => p.id === detailProjectId)
    : null;
  if (detailProjectFromList) {
    detailProjectRef.current = detailProjectFromList;
  } else if (viewMode !== 'detail' || !detailProjectId) {
    detailProjectRef.current = null;
  }
  const detailProject = detailProjectFromList ?? detailProjectRef.current;

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-zinc-500">Loading projects...</div>
      </main>
    );
  }

  return (
    <>
      <main className="flex-1 flex flex-col overflow-hidden">
        {viewMode === 'list' ? (
          <>
            <header className="border-b border-zinc-800 px-6 pt-4 pb-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-medium text-zinc-100">Projects</h2>
                  <p className="text-xs text-zinc-500">
                    {filteredProjects.length}/{projects.length} project{projects.length !== 1 ? 's' : ''}
                    {searchQuery && <span className="ml-1 text-zinc-600">— filtered</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search projects…"
                      className="pl-8 pr-7 h-8 w-52 bg-zinc-800/50 border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-zinc-600"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="h-8 px-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md focus:outline-none"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="status">Sort: Status</option>
                    <option value="vulns">Sort: Vulns</option>
                  </select>
                  <span className="text-xs text-zinc-600">
                    {lastRefresh.toLocaleTimeString()}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    onClick={fetchProjects}
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Category filter tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0 -mb-px">
                {(['all', 'running', 'stopped', ...categories] as const).map((cat) => {
                  const isAll = cat === 'all';
                  const active = isAll ? selectedCategory === null : selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(isAll ? null : cat)}
                      className={cn(
                        'shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize',
                        active
                          ? 'border-amber-500 text-amber-400'
                          : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                      )}
                    >
                      {isAll ? 'All' : cat}
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="flex-1 overflow-auto">
              <div className="px-6 pt-6">
                <SystemHealth patchStatus={patchStatus ?? undefined} />
              </div>
              <ProjectList
                projects={filteredProjects}
                selectedId={selectedProjectId}
                onSelect={handleSelect}
                onStart={handleStart}
                onStop={handleStop}
                onViewLogs={handleViewLogs}
                onViewDetails={handleViewDetails}
                onClearCache={handleClearCache}
                onDeleteLock={handleDeleteLock}
              />
            </div>
          </>
        ) : detailProject ? (
          <ProjectDetail
            project={detailProject}
            onBack={handleBackToList}
            onStart={handleStart}
            onStop={handleStop}
            onClearCache={handleClearCache}
            onDeleteLock={handleDeleteLock}
            onRefresh={fetchProjects}
            categories={categories}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-zinc-500">Loading project details...</div>
          </div>
        )}
      </main>
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="flex-1 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
