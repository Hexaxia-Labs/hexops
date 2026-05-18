'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  RefreshCw, GitBranch, GitCommit, AlertCircle,
  Package, Plus, Trash2, Download, Upload,
} from 'lucide-react';

interface GitSectionProps {
  projectId: string;
  projectPath: string;
  onBranchChange?: () => void;
}

interface GitInfo {
  branch: string;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
  isDirty: boolean;
  uncommittedCount: number;
  untrackedCount: number;
}

interface BranchInfo {
  current: string;
  local: string[];
  remote: string[];
}

interface Stash {
  ref: string;
  message: string;
  date: string;
}

export function GitSection({ projectId, onBranchChange }: GitSectionProps) {
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [branches, setBranches] = useState<BranchInfo | null>(null);
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [branchOp, setBranchOp] = useState<string | null>(null);
  const [pickedBranch, setPickedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [stashOp, setStashOp] = useState<string | null>(null);
  const [stashMessage, setStashMessage] = useState('');
  const [showStashPush, setShowStashPush] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [gitRes, branchRes, stashRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/git`),
        fetch(`/api/projects/${projectId}/git-branch`),
        fetch(`/api/projects/${projectId}/git-stash`),
      ]);
      if (gitRes.ok) setInfo(await gitRes.json());
      if (branchRes.ok) setBranches(await branchRes.json());
      if (stashRes.ok) { const d = await stashRes.json(); setStashes(d.stashes ?? []); }
      setError(null);
    } catch {
      setError('Could not load git info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [projectId]);

  const switchBranch = async (branch: string, create = false) => {
    setBranchOp(branch);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, create }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchAll();
      setShowNewBranch(false);
      setNewBranchName('');
      setPickedBranch('');
      onBranchChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Branch switch failed');
    } finally {
      setBranchOp(null);
    }
  };

  const stashAction = async (action: 'push' | 'pop' | 'apply' | 'drop', ref?: string) => {
    const key = action + (ref ?? '');
    setStashOp(key);
    try {
      const body: Record<string, string> = { action };
      if (action === 'push' && stashMessage) body.message = stashMessage;
      if (ref) body.ref = ref;
      const res = await fetch(`/api/projects/${projectId}/git-stash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchAll();
      setShowStashPush(false);
      setStashMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stash operation failed');
    } finally {
      setStashOp(null);
    }
  };

  if (loading) return <div className="text-zinc-500 text-sm">Loading git info...</div>;

  if (error) {
    return (
      <div className="text-zinc-500 text-sm flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {error}
        <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={() => { setError(null); fetchAll(); }}>
          Retry
        </Button>
      </div>
    );
  }

  if (!info) return <div className="text-zinc-500 text-sm">Not a git repository</div>;

  const otherLocal = branches?.local.filter((b) => b !== branches.current) ?? [];
  const remoteOnly = branches?.remote.filter((r) => !branches.local.some((l) => r.endsWith(l))) ?? [];
  const allBranches = [...otherLocal, ...remoteOnly];

  return (
    <div className="space-y-4">
      {/* Branch row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-200">{info.branch}</span>
            {allBranches.length > 0 && (
              <>
                <select
                  value={pickedBranch}
                  disabled={!!branchOp}
                  onChange={(e) => setPickedBranch(e.target.value)}
                  className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-200 rounded px-1.5 py-0.5 h-7 cursor-pointer ml-2"
                >
                  <option value="">Switch to…</option>
                  {otherLocal.length > 0 && (
                    <optgroup label="Local">
                      {otherLocal.map((b) => <option key={b} value={b}>{b}</option>)}
                    </optgroup>
                  )}
                  {remoteOnly.length > 0 && (
                    <optgroup label="Remote">
                      {remoteOnly.map((b) => <option key={b} value={b}>{b}</option>)}
                    </optgroup>
                  )}
                </select>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!pickedBranch || !!branchOp}
                  onClick={() => pickedBranch && switchBranch(pickedBranch)}
                  title={pickedBranch ? `Switch to ${pickedBranch}` : 'Pick a branch first'}
                >
                  {branchOp ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Switch'}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-zinc-500"
              title="New branch"
              onClick={() => setShowNewBranch((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {info.isDirty && (
            <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-400">
              Uncommitted changes
            </Badge>
          )}
        </div>

        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400" onClick={fetchAll}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {/* New branch input */}
      {showNewBranch && (
        <div className="flex items-center gap-2">
          <Input
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="new-branch-name"
            className="h-7 text-xs bg-zinc-900 border-zinc-700"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newBranchName) switchBranch(newBranchName, true);
              if (e.key === 'Escape') { setShowNewBranch(false); setNewBranchName(''); }
            }}
          />
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!newBranchName || !!branchOp}
            onClick={() => switchBranch(newBranchName, true)}
          >
            {branchOp ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Create'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowNewBranch(false); setNewBranchName(''); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Change counts */}
      {(info.uncommittedCount > 0 || info.untrackedCount > 0) && (
        <div className="flex gap-4 text-xs">
          {info.uncommittedCount > 0 && (
            <span className="text-yellow-400">{info.uncommittedCount} modified file{info.uncommittedCount !== 1 ? 's' : ''}</span>
          )}
          {info.untrackedCount > 0 && (
            <span className="text-zinc-500">{info.untrackedCount} untracked file{info.untrackedCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {/* Last Commit */}
      <div className="bg-zinc-900 rounded-md p-3">
        <div className="flex items-start gap-2">
          <GitCommit className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200 truncate">{info.lastCommit.message}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
              <span className="font-mono">{info.lastCommit.hash}</span>
              <span>by {info.lastCommit.author}</span>
              <span>{new Date(info.lastCommit.date).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stash section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Stash
            {stashes.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stashes.length}</Badge>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-zinc-400"
            onClick={() => setShowStashPush((v) => !v)}
          >
            <Download className="h-3 w-3 mr-1" />
            Push stash
          </Button>
        </div>

        {showStashPush && (
          <div className="flex items-center gap-2 mb-2">
            <Input
              value={stashMessage}
              onChange={(e) => setStashMessage(e.target.value)}
              placeholder="Stash message (optional)"
              className="h-7 text-xs bg-zinc-900 border-zinc-700"
              onKeyDown={(e) => {
                if (e.key === 'Enter') stashAction('push');
                if (e.key === 'Escape') setShowStashPush(false);
              }}
            />
            <Button
              size="sm"
              className="h-7 text-xs whitespace-nowrap"
              disabled={!!stashOp}
              onClick={() => stashAction('push')}
            >
              {stashOp === 'push' ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Save'}
            </Button>
          </div>
        )}

        {stashes.length === 0 ? (
          <p className="text-xs text-zinc-600">No stashes</p>
        ) : (
          <div className="space-y-1">
            {stashes.map((s) => (
              <div key={s.ref} className="flex items-center gap-2 bg-zinc-900 rounded px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-300 truncate">{s.message}</p>
                  <p className="text-[10px] text-zinc-600 font-mono">{s.ref}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-200"
                    title="Apply"
                    disabled={!!stashOp}
                    onClick={() => stashAction('apply', s.ref)}
                  >
                    {stashOp === ('apply' + s.ref) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-200"
                    title="Pop"
                    disabled={!!stashOp}
                    onClick={() => stashAction('pop', s.ref)}
                  >
                    {stashOp === ('pop' + s.ref) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
                    title="Drop"
                    disabled={!!stashOp}
                    onClick={() => stashAction('drop', s.ref)}
                  >
                    {stashOp === ('drop' + s.ref) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
