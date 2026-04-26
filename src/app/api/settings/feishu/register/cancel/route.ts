/**
 * Cancel an in-flight Feishu QR registration session.
 * POST { session_id }
 */

import { NextResponse } from 'next/server';
import { cancelRegistrationSession } from '@/lib/channels/feishu/qr-registration';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = body.session_id;
    if (sessionId) {
      cancelRegistrationSession(sessionId);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to cancel session' },
      { status: 500 },
    );
  }
}
