'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, X, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/types';

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
};

const SEV_TEXT: Record<string, string> = {
  critical: 'text-red-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications ?? []);
        setUnread(d.unread ?? 0);
      }
    } catch { /* ignore */ }
  };

  // Poll every 30s
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark-all-read' }) });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
  };

  const dismiss = async (id: string) => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss', id }) });
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const clearAll = async () => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear-all' }) });
    setNotifications([]);
    setUnread(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) load(); }}
        className="relative p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-xs font-medium text-zinc-300">
              Notifications {unread > 0 && <span className="text-red-400">({unread} unread)</span>}
            </span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors" title="Mark all read">
                  <Check className="h-3 w-3" />
                </button>
              )}
              <button onClick={clearAll} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors" title="Clear all">
                <Trash2 className="h-3 w-3" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-6">No notifications</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    'flex gap-2.5 px-3 py-2.5 border-b border-zinc-800 last:border-0',
                    !n.read && 'bg-zinc-800/50'
                  )}
                >
                  <div className={cn('mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0', SEV_COLORS[n.severity] || 'bg-zinc-500')} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-medium truncate', SEV_TEXT[n.severity] || 'text-zinc-300')}>{n.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">{new Date(n.timestamp).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => dismiss(n.id)}
                    className="flex-shrink-0 p-0.5 rounded text-zinc-700 hover:text-zinc-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
