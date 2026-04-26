'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface ProjectStatus {
  id: string;
  name: string;
  category: string;
  status: 'running' | 'stopped';
}

interface SidebarData {
  categories: string[];
  projectCounts: Record<string, number>;
  runningCount: number;
  totalCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SidebarContext = createContext<SidebarData | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [runningCount, setRunningCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/sidebar', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const projects: ProjectStatus[] = data.projects || [];

      const cats = [...new Set(projects.map(p => p.category))].filter(Boolean).sort();
      setCategories(cats);

      const counts: Record<string, number> = {};
      for (const cat of cats) {
        counts[cat] = projects.filter(p => p.category === cat).length;
      }
      setProjectCounts(counts);

      setRunningCount(projects.filter(p => p.status === 'running').length);
      setTotalCount(projects.length);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // Swallow network errors silently — server may still be starting up
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch with abort on unmount
  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Poll for updates every 10 seconds with abort on unmount
  useEffect(() => {
    const interval = setInterval(() => {
      const controller = new AbortController();
      fetchData(controller.signal);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <SidebarContext.Provider value={{
      categories,
      projectCounts,
      runningCount,
      totalCount,
      isLoading,
      refresh: () => fetchData(),
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarData {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
