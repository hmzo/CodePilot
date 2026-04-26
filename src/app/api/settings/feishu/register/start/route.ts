/**
 * Start Feishu QR registration session.
 * POST { env? } — env defaults to 'prod'. Returns a QR data URL the
 * client can render directly in an <img>.
 */

import { NextResponse } from 'next/server';
import { startRegistrationSession } from '@/lib/channels/feishu/qr-registration';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const env = (body.env as 'prod' | 'boe' | 'pre' | undefined) ?? 'prod';
    const result = await startRegistrationSession(env);
    return NextResponse.json({
      session_id: result.sessionId,
      qr_image: result.qrImage,
      verification_uri: result.verificationUri,
      expire_in: result.expireIn,
      interval: result.interval,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start Feishu registration' },
      { status: 500 },
    );
  }
}
