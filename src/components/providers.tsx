'use client';

import { ReactNode, useState, useEffect, createContext, useContext, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { Sidebar } from '@/components/sidebar';
import { AddProjectDialog } from '@/components/add-project-dialog';
import { ShellPanel } from '@/components/shell-panel';
import { X } from 'lucide-react';

interface ShellContextValue {
  openShell: (cwd?: string, label?: string) => void;
}
const ShellContext = createContext<ShellContextValue>({ openShell: () => {} });
export function useShell() { return useContext(ShellContext); }

interface ProvidersProps {
  children: ReactNode;
}

function AppShell({ children }: { children: ReactNode }) {
  const [showAddProject, setShowAddProject] = useState(false);
  const [showShell, setShowShell] = useState(false);
  const [shellCwd, setShellCwd] = useState<string>('');
  const [shellLabel, setShellLabel] = useState<string>('Shell');
  const [projectsRoot, setProjectsRoot] = useState<string>('');
  const { categories, refresh } = useSidebar();
  const router = useRouter();

  const openShell = useCallback((cwd?: string, label?: string) => {
    setShellCwd(cwd ?? projectsRoot);
    setShellLabel(label ?? 'Shell');
    setShowShell(true);
  }, [projectsRoot]);

  // Fetch projectsRoot for shell default directory
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setProjectsRoot(data.projectsRoot || ''))
      .catch(() => {});
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);

      // Ctrl+1-4 — navigate pages (never in inputs)
      if (ctrl && !inInput) {
        if (e.key === '1') { e.preventDefault(); router.push('/'); return; }
        if (e.key === '2') { e.preventDefault(); router.push('/patches'); return; }
        if (e.key === '3') { e.preventDefault(); router.push('/logs'); return; }
        if (e.key === '4') { e.preventDefault(); router.push('/settings'); return; }
        // Ctrl+` — toggle shell panel
        if (e.key === '`') { e.preventDefault(); setShowShell((s) => !s); return; }
      }

      // Ctrl+K or / — focus search input (even from inputs, allow escape)
      if ((ctrl && e.key === 'k') || (!inInput && e.key === '/')) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-shortcut="search"]');
        if (searchInput) { searchInput.focus(); searchInput.select(); }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  return (
    <ShellContext.Provider value={{ openShell }}>
    <div className="flex h-screen bg-zinc-950">
      <Sidebar
        onAddProject={() => setShowAddProject(true)}
        onOpenShell={() => openShell()}
      />
      {children}

      {/* Shell Panel */}
      {showShell && (shellCwd || projectsRoot) && (
        <div className="w-[500px] h-full border-l border-zinc-800 flex flex-col bg-zinc-950 flex-shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 flex-shrink-0">
            <span className="text-sm font-medium text-zinc-300">{shellLabel}</span>
            <button
              onClick={() => setShowShell(false)}
              className="p-1 hover:bg-zinc-800 rounded transition-colors"
            >
              <X className="h-4 w-4 text-zinc-500" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ShellPanel key={shellCwd} cwd={shellCwd || projectsRoot} label={shellLabel} />
          </div>
        </div>
      )}

      <AddProjectDialog
        open={showAddProject}
        onOpenChange={setShowAddProject}
        onSuccess={refresh}
        categories={categories}
      />
    </div>
    </ShellContext.Provider>
  );
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SidebarProvider>
      <AppShell>
        {children}
      </AppShell>
    </SidebarProvider>
  );
}
