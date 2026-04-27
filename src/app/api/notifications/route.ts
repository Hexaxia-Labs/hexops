import { NextRequest, NextResponse } from 'next/server';
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  dismissNotification,
  clearAllNotifications,
} from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);
  const countOnly = params.get('count') === '1';

  if (countOnly) {
    return NextResponse.json({ unread: getUnreadCount() });
  }

  return NextResponse.json({
    notifications: getNotifications(limit),
    unread: getUnreadCount(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action, id } = body as { action: string; id?: string };

  if (action === 'mark-all-read') {
    markAllRead();
    return NextResponse.json({ success: true });
  }

  if (action === 'mark-read' && id) {
    markRead(id);
    return NextResponse.json({ success: true });
  }

  if (action === 'dismiss' && id) {
    dismissNotification(id);
    return NextResponse.json({ success: true });
  }

  if (action === 'clear-all') {
    clearAllNotifications();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
