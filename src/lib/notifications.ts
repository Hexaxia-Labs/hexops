import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Notification } from './types';
import { getGlobalSettings } from './settings';

const STORE_DIR = join(process.cwd(), '.hexops', 'notifications');
const STORE_FILE = join(STORE_DIR, 'notifications.json');
const MAX_STORED = 500;

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

function readAll(): Notification[] {
  try {
    ensureDir();
    if (!existsSync(STORE_FILE)) return [];
    return JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as Notification[];
  } catch {
    return [];
  }
}

function writeAll(notifications: Notification[]) {
  ensureDir();
  writeFileSync(STORE_FILE, JSON.stringify(notifications.slice(0, MAX_STORED), null, 2), 'utf-8');
}

export function getNotifications(limit = 50): Notification[] {
  return readAll().slice(0, limit);
}

export function getUnreadCount(): number {
  return readAll().filter(n => !n.read).length;
}

export function markAllRead() {
  const all = readAll();
  writeAll(all.map(n => ({ ...n, read: true })));
}

export function markRead(id: string) {
  const all = readAll();
  writeAll(all.map(n => n.id === id ? { ...n, read: true } : n));
}

export function dismissNotification(id: string) {
  writeAll(readAll().filter(n => n.id !== id));
}

export function clearAllNotifications() {
  writeAll([]);
}

export function addNotification(n: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
  const notification: Notification = {
    ...n,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };

  const all = readAll();
  writeAll([notification, ...all]);

  // Fire webhook if configured
  const settings = getGlobalSettings();
  if (settings.notifications?.enabled && settings.notifications?.webhookUrl) {
    const shouldFire =
      (n.severity === 'critical' && settings.notifications.webhookOnCritical) ||
      (n.category === 'application' && settings.notifications.webhookOnCrash);

    if (shouldFire) {
      fetch(settings.notifications.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: notification.severity,
          category: notification.category,
          title: notification.title,
          message: notification.message,
          projectId: notification.projectId,
          timestamp: notification.timestamp,
          actionUrl: notification.actionUrl,
        }),
      }).catch(() => {}); // fire-and-forget
    }
  }

  return notification;
}
