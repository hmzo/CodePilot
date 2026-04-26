/**
 * Poll Feishu QR registration session.
 * POST { session_id } — returns current status and (when confirmed) the
 * resolved app credentials. On confirmation the credentials are persisted
 * to the settings table and the bridge is restarted if it was running so
 * the new app can pick up traffic immediately.
 */

import { NextResponse } from 'next/server';
import {
  pollRegistrationSession,
  cancelRegistrationSession,
} from '@/lib/channels/feishu/qr-registration';
import { setSetting } from '@/lib/db';
import { getStatus, restart } from '@/lib/bridge/bridge-manager';

async function restartIfRunning(): Promise<string | undefined> {
  if (!getStatus().running) {
    return undefined;
  }
  try {
    const result = await restart();
    return result.started ? undefined : (result.reason || 'Bridge restart failed');
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = body.session_id;
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const session = await pollRegistrationSession(sessionId);

    let bridgeRestartError: string | undefined;
    if (session.status === 'confirmed' && session.result) {
      setSetting('bridge_feishu_app_id', session.result.appId);
      setSetting('bridge_feishu_app_secret', session.result.appSecret);
      setSetting('bridge_feishu_domain', session.result.domain);
      bridgeRestartError = await restartIfRunning();
      // Let the client read the final status, then drop the session.
      setTimeout(() => cancelRegistrationSession(sessionId), 30_000);
    } else if (session.status === 'failed' || session.status === 'expired') {
      setTimeout(() => cancelRegistrationSession(sessionId), 30_000);
    }

    return NextResponse.json({
      status: session.status,
      qr_image: session.qrImage || undefined,
      verification_uri: session.verificationUri || undefined,
      domain: session.domainBrand,
      domain_switched: session.domainSwitched,
      app_id: session.result?.appId,
      // Never echo the secret back to the browser — the client just needs
      // a confirmation signal to refresh stored settings.
      error: session.error,
      bridge_restart_error: bridgeRestartError,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to poll Feishu registration' },
      { status: 500 },
    );
  }
}
