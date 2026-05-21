'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface InitialSidebarProject {
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
  refresh: () => void;
}

const SidebarContext = createContext<SidebarData | null>(null);

function deriveCategories(projects: InitialSidebarProject[]): string[] {
  return [...new Set(projects.map(p => p.category))].filter(Boolean).sort();
}

function deriveCounts(projects: InitialSidebarProject[], cats: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cat of cats) {
    counts[cat] = projects.filter(p => p.category === cat).length;
  }
  return counts;
}

export function SidebarProvider({ children, initialProjects = [] }: { children: ReactNode; initialProjects?: InitialSidebarProject[] }) {
  const initCats = deriveCategories(initialProjects);
  const [categories, setCategories] = useState<string[]>(initCats);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>(deriveCounts(initialProjects, initCats));
  const [runningCount, setRunningCount] = useState(() => initialProjects.filter(p => p.status === 'running').length);
  const [totalCount, setTotalCount] = useState(() => initialProjects.length);
  const [isLoading, setIsLoading] = useState(initialProjects.length === 0);

  const loadData = useCallback(() => {
    fetch('/api/sidebar')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const projects: InitialSidebarProject[] = data.projects || [];
        const cats = deriveCategories(projects);
        setCategories(cats);
        setProjectCounts(deriveCounts(projects, cats));
        setRunningCount(projects.filter(p => p.status === 'running').length);
        setTotalCount(projects.length);
      })
      .catch(() => { /* fetch unavailable in this env — initial data from SSR is used */ })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <SidebarContext.Provider value={{
      categories,
      projectCounts,
      runningCount,
      totalCount,
      isLoading,
      refresh: loadData,
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
