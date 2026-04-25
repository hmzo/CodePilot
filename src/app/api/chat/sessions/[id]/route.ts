import { NextRequest } from 'next/server';
import { deleteSession, getSession, updateSessionWorkingDirectory, updateSessionTitle, updateSessionMode, updateSessionModel, clearSessionMessages, updateSdkSessionId, updateSessionPermissionProfile } from '@/lib/db';
import { autoApprovePendingForSession } from '@/lib/bridge/permission-broker';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    return Response.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get session';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = await request.json();

    if (body.working_directory) {
      updateSessionWorkingDirectory(id, body.working_directory);
    }
    if (body.title) {
      updateSessionTitle(id, body.title);
    }
    if (body.mode) {
      updateSessionMode(id, body.mode);
    }
    // Track whether model actually changed — if so, the old sdk_session_id
    // is stale and must be cleared to prevent resume failures against a
    // different model.
    const modelChanged = body.model !== undefined && body.model !== session.model;

    if (body.model !== undefined) {
      updateSessionModel(id, body.model);
    }
    if (body.sdk_session_id !== undefined) {
      updateSdkSessionId(id, body.sdk_session_id);
    }

    // Server-side guard: when model changed and the caller didn't explicitly
    // set sdk_session_id in the same request, force-clear it so the next chat
    // message starts a fresh SDK session instead of trying to resume the old
    // one (which would fail with a different model).
    if (modelChanged && body.sdk_session_id === undefined) {
      if (session.sdk_session_id) {
        console.log(
          `[session-api] Model changed for session ${id}, clearing stale sdk_session_id`,
          { oldSdkSessionId: session.sdk_session_id.slice(0, 8) + '...' }
        );
      }
      updateSdkSessionId(id, '');
    }
    if (body.permission_profile !== undefined) {
      if (body.permission_profile !== 'default' && body.permission_profile !== 'full_access') {
        return Response.json({ error: 'permission_profile must be "default" or "full_access"' }, { status: 400 });
      }
      // When switching to full_access, auto-approve any pending bridge permissions
      const previousProfile = session.permission_profile || 'default';
      updateSessionPermissionProfile(id, body.permission_profile);
      if (previousProfile !== 'full_access' && body.permission_profile === 'full_access') {
        try {
          autoApprovePendingForSession(id);
        } catch (err) {
          console.warn('[session-api] Failed to auto-approve pending permissions:', err);
        }
      }
    }
    if (body.clear_messages) {
      clearSessionMessages(id);
    }

    const updated = getSession(id);
    return Response.json({ session: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update session';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    deleteSession(id);
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete session';
    return Response.json({ error: message }, { status: 500 });
  }
}
