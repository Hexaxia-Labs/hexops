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
  refresh: () => void;
}

const SidebarContext = createContext<SidebarData | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [runningCount, setRunningCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    fetch('/api/sidebar')
      .then(r => r.json())
      .then((data) => {
        const projects: ProjectStatus[] = data.projects || [];
        const cats = [...new Set(projects.map(p => p.category))].filter(Boolean).sort();
        const counts: Record<string, number> = {};
        for (const cat of cats) {
          counts[cat] = projects.filter(p => p.category === cat).length;
        }
        setCategories(cats);
        setProjectCounts(counts);
        setRunningCount(projects.filter(p => p.status === 'running').length);
        setTotalCount(projects.length);
      })
      .catch(() => {})
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
