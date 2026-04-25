import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getSetting } from '@/lib/db';
import { getLatestSessionByWorkingDirectory, createSession } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const workspacePath = getSetting('assistant_workspace_path');
    if (!workspacePath) {
      return NextResponse.json({ error: 'No workspace path configured' }, { status: 400 });
    }

    // Validate that the workspace directory actually exists and is accessible
    try {
      const stat = fs.statSync(workspacePath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: 'Workspace path is not a directory', code: 'not_a_directory' }, { status: 400 });
      }
      fs.accessSync(workspacePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      return NextResponse.json({ error: 'Workspace path does not exist or is not accessible', code: 'path_invalid' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const forceNew = body?.forceNew === true;

    let session = forceNew ? null : getLatestSessionByWorkingDirectory(workspacePath);
    if (!session) {
      const model = typeof body.model === 'string' ? body.model : '';
      session = createSession(undefined, model, undefined, workspacePath, 'code');
    }

    return NextResponse.json({ session, isNew: !session.sdk_session_id });
  } catch (e) {
    console.error('[workspace/session] POST failed:', e);
    return NextResponse.json({ error: 'Failed to create/find session' }, { status: 500 });
  }
}
