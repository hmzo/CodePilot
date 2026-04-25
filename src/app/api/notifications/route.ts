import { NextRequest, NextResponse } from 'next/server';

/**
 * POST: Receive a notification from MCP tools and queue it.
 * GET:  Frontend polls this to drain queued notifications for toast display.
 *
 * Backed by `src/lib/notification-manager.ts` (in-process ring buffer + Telegram).
 * Used by `codepilot_notify` MCP tool, the renderer poll hook, and the
 * Electron tray-mode background poller.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: notifBody, priority } = body as { title: string; body: string; priority?: string };

    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const { sendNotification } = await import('@/lib/notification-manager');
    const result = await sendNotification({
      title,
      body: notifBody || '',
      priority: (priority as 'low' | 'normal' | 'urgent') || 'normal',
    });

    return NextResponse.json({ success: true, sent: result.sent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { drainNotifications } = await import('@/lib/notification-manager');
    const notifications = drainNotifications();
    return NextResponse.json({ notifications });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
