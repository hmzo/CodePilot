import { NextRequest } from 'next/server';
import { streamClaude } from '@/lib/claude-client';
import { addMessage, getMessages, getSession, getSessionSummary, updateSessionTitle, updateSdkSessionId, updateSessionModel, getSetting, acquireSessionLock, renewSessionLock, releaseSessionLock, setSessionRuntimeStatus } from '@/lib/db';
import { notifySessionStart, notifySessionComplete, notifySessionError } from '@/lib/telegram-bot';
import { loadCodePilotMcpServers } from '@/lib/mcp-loader';
import { assembleContext } from '@/lib/context-assembler';
import type { SendMessageRequest, SSEEvent, TokenUsage, MessageContentBlock, FileAttachment, ClaudeStreamOptions, MediaBlock } from '@/types';
import { saveMediaToLibrary } from '@/lib/media-saver';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let activeSessionId: string | undefined;
  let activeLockId: string | undefined;

  try {
    const body: SendMessageRequest & { files?: FileAttachment[]; toolTimeout?: number; systemPromptAppend?: string; autoTrigger?: boolean; thinking?: unknown; effort?: string; enableFileCheckpointing?: boolean; displayOverride?: string; context_1m?: boolean } = await request.json();
    const { session_id, content, model, mode, files, toolTimeout, systemPromptAppend, autoTrigger, thinking, effort, enableFileCheckpointing, displayOverride, context_1m } = body;

    console.log('[chat API] content length:', content.length, 'first 200 chars:', content.slice(0, 200));
    console.log('[chat API] systemPromptAppend:', systemPromptAppend ? `${systemPromptAppend.length} chars` : 'none');

    if (!session_id || !content) {
      return new Response(JSON.stringify({ error: 'session_id and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const session = getSession(session_id);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Acquire exclusive lock for this session to prevent concurrent requests
    const lockId = crypto.randomBytes(8).toString('hex');
    const lockAcquired = acquireSessionLock(session_id, lockId, `chat-${process.pid}`, 600);
    if (!lockAcquired) {
      return new Response(
        JSON.stringify({ error: 'Session is busy processing another request', code: 'SESSION_BUSY' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
    activeSessionId = session_id;
    activeLockId = lockId;
    setSessionRuntimeStatus(session_id, 'running');

    // Telegram notification: session started (fire-and-forget)
    // Skip for auto-trigger turns (onboarding/heartbeat) — these are invisible system triggers
    const telegramNotifyOpts = {
      sessionId: session_id,
      sessionTitle: session.title !== 'New Chat' ? session.title : content.slice(0, 50),
      workingDirectory: session.working_directory,
    };
    if (!autoTrigger) {
      notifySessionStart(telegramNotifyOpts).catch(() => {});
    }

    // Save user message — persist file metadata so attachments survive page reload
    // Skip saving for autoTrigger messages (invisible system triggers for assistant hooks)
    // Use displayOverride for DB storage if provided (e.g. /skillName instead of expanded prompt)
    let savedContent = displayOverride || content;
    let fileMeta: Array<{ id: string; name: string; type: string; size: number; filePath: string }> | undefined;
    if (!autoTrigger) {
      if (files && files.length > 0) {
        const workDir = session.working_directory;
        const uploadDir = path.join(workDir, '.codepilot-uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fileMeta = files.map((f) => {
          const safeName = path.basename(f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = path.join(uploadDir, `${Date.now()}-${safeName}`);
          const buffer = Buffer.from(f.data, 'base64');
          fs.writeFileSync(filePath, buffer);
          return { id: f.id, name: f.name, type: f.type, size: buffer.length, filePath };
        });
        savedContent = `<!--files:${JSON.stringify(fileMeta)}-->${displayOverride || content}`;
      }
      addMessage(session_id, 'user', savedContent);

      // Auto-generate title from first message if still default
      if (session.title === 'New Chat') {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        updateSessionTitle(session_id, title);
      }
    }

    // Determine model: request override > session model > default setting.
    // Model ID is now passed straight through to the SDK, which forwards it
    // upstream as ANTHROPIC_MODEL. CodePilot does not map IDs anymore.
    const effectiveModel = model || session.model || getSetting('default_model') || undefined;

    // Persist model to session so usage stats can group by model.
    // This runs on every message but the DB writes are cheap (single UPDATE by PK).
    if (effectiveModel && effectiveModel !== session.model) {
      updateSessionModel(session_id, effectiveModel);
    }

    // Resolve permission mode from request body (sent by frontend on each message)
    // or fall back to session's persisted mode from DB.
    // Request body mode takes priority to avoid race condition: user switches mode
    // then immediately sends — the PATCH may not have landed in DB yet.
    const effectiveMode = mode || session.mode || 'code';
    const permissionMode = effectiveMode === 'plan' ? 'plan' : 'acceptEdits';

    // Plan mode takes precedence over full_access: if the user explicitly chose
    // Plan, they expect no tool execution regardless of permission profile.
    const bypassPermissions = session.permission_profile === 'full_access' && effectiveMode !== 'plan';
    const systemPromptOverride: string | undefined = undefined;

    const abortController = new AbortController();

    // Handle client disconnect
    request.signal.addEventListener('abort', () => {
      abortController.abort();
    });

    // Convert file attachments to the format expected by streamClaude.
    // Include filePath from the already-saved files so claude-client can
    // reference the on-disk copies instead of writing them again.
    const fileAttachments: FileAttachment[] | undefined = files && files.length > 0
      ? files.map((f, i) => {
          const meta = fileMeta?.find((m: { id: string }) => m.id === f.id);
          return {
            id: f.id || `file-${Date.now()}-${i}`,
            name: f.name,
            type: f.type,
            size: f.size,
            data: meta?.filePath ? '' : f.data, // Clear base64 once written to disk — claude-client reads from filePath on demand
            filePath: meta?.filePath,
          };
        })
      : undefined;

    // Load conversation history from DB as fallback context.
    // Fetch up to 200 messages (DB query is cheap); actual truncation is done
    // by buildFallbackContext using a token budget, not a fixed message count.
    const { messages: recentMsgs } = getMessages(session_id, { limit: 200, excludeHeartbeatAck: true });
    // Exclude the user message we just saved (last in the list) — it's already the prompt
    const historyMsgs = recentMsgs.slice(0, -1).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Load session summary for compression-aware fallback
    const sessionSummaryData = getSessionSummary(session_id);

    // Detect actual image agent mode by checking for the specific design agent prompt,
    // not just any systemPromptAppend (which could come from CLI badges or skills).
    const isImageAgentMode = !!systemPromptAppend && systemPromptAppend.includes('image-gen-request');

    // Unified context assembly — extracts workspace, CLI tools, widget prompt
    const assembled = await assembleContext({
      session,
      entryPoint: 'desktop',
      userPrompt: content,
      systemPromptAppend,
      conversationHistory: historyMsgs,
      imageAgentMode: isImageAgentMode,
      autoTrigger: !!autoTrigger,
    });
    const finalSystemPrompt = assembled.systemPrompt;
    const generativeUIEnabled = assembled.generativeUIEnabled;
    const assistantProjectInstructions = assembled.assistantProjectInstructions;
    const isAssistantProject = assembled.isAssistantProject;

    // Load only MCP servers needing CodePilot-specific processing (${...} env placeholders).
    // All other MCP servers are auto-loaded by the SDK via settingSources.
    const mcpServers = loadCodePilotMcpServers();

    // ── Fallback budget for history ─────────────────────────────────
    // Compute a conservative budget so buildFallbackContext can truncate
    // older messages when the SDK can't resume by sdkSessionId.
    const activeSessionSummary = sessionSummaryData.summary || undefined;
    let fallbackTokenBudget: number | undefined;

    try {
      const { estimateContextTokens } = await import('@/lib/context-estimator');
      const { getContextWindow } = await import('@/lib/model-context');
      const modelForWindow = effectiveModel || 'sonnet';
      const contextWindow = getContextWindow(modelForWindow, { context1m: context_1m }) || 200000;
      const estimate = estimateContextTokens({
        systemPrompt: finalSystemPrompt,
        history: historyMsgs,
        currentUserMessage: content,
        sessionSummary: activeSessionSummary,
      });
      fallbackTokenBudget = Math.floor(
        contextWindow * 0.7 - estimate.breakdown.system - estimate.breakdown.summary - estimate.breakdown.userMessage
      );
    } catch (estimateErr) {
      console.warn('[chat API] Context estimation failed, proceeding without budget:', estimateErr);
    }

    // Stream Claude response, using SDK session ID for resume if available
    console.log('[chat API] streamClaude params:', {
      promptLength: content.length,
      promptFirst200: content.slice(0, 200),
      sdkSessionId: session.sdk_session_id || 'none',
      systemPromptLength: finalSystemPrompt?.length || 0,
      systemPromptFirst200: finalSystemPrompt?.slice(0, 200) || 'none',
    });
    const stream = streamClaude({
      prompt: content,
      sessionId: session_id,
      sdkSessionId: session.sdk_session_id || undefined,
      model: effectiveModel,
      systemPrompt: finalSystemPrompt,
      workingDirectory: session.sdk_cwd || session.working_directory || undefined,
      abortController,
      permissionMode,
      files: fileAttachments,
      imageAgentMode: isImageAgentMode,
      toolTimeoutSeconds: toolTimeout || 300,
      mcpServers,
      conversationHistory: historyMsgs,
      sessionSummary: activeSessionSummary,
      fallbackTokenBudget,
      bypassPermissions,
      thinking: thinking as ClaudeStreamOptions['thinking'],
      effort: effort as ClaudeStreamOptions['effort'],
      context1m: context_1m,
      generativeUI: generativeUIEnabled,
      enableFileCheckpointing: enableFileCheckpointing ?? true,
      autoTrigger: !!autoTrigger,
      onRuntimeStatusChange: (status: string) => {
        try { setSessionRuntimeStatus(session_id, status); } catch { /* best effort */ }
      },
    });

    // Tee the stream: one for client, one for collecting the response
    const [streamForClient, streamForCollect] = stream.tee();

    // Periodically renew the session lock so long-running tasks don't expire
    const lockRenewalInterval = setInterval(() => {
      try { renewSessionLock(session_id, lockId, 600); } catch { /* best effort */ }
    }, 60_000);

    // Save assistant message in background, with cleanup callback to release lock
    const isHeartbeatTurn = !!autoTrigger && content.includes('心跳检查');
    collectStreamResponse(streamForCollect, session_id, telegramNotifyOpts, () => {
      clearInterval(lockRenewalInterval);
      releaseSessionLock(session_id, lockId);
      setSessionRuntimeStatus(session_id, 'idle');
    }, { isHeartbeatTurn, suppressNotifications: !!autoTrigger });

    return new Response(streamForClient, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    // Release lock and reset status on error (only if lock was acquired)
    if (activeSessionId && activeLockId) {
      try {
        releaseSessionLock(activeSessionId, activeLockId);
        setSessionRuntimeStatus(activeSessionId, 'idle', error instanceof Error ? error.message : 'Unknown error');
      } catch { /* best effort */ }
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function collectStreamResponse(
  stream: ReadableStream<string>,
  sessionId: string,
  telegramOpts: { sessionId?: string; sessionTitle?: string; workingDirectory?: string },
  onComplete?: () => void,
  opts?: { isHeartbeatTurn?: boolean; suppressNotifications?: boolean },
) {
  const reader = stream.getReader();
  const contentBlocks: MessageContentBlock[] = [];
  let currentText = '';
  let thinkingText = '';
  /** Tracks whether non-thinking content arrived since last thinking delta (for phase separation) */
  let thinkingPhaseEnded = false;
  let tokenUsage: TokenUsage | null = null;
  let hasError = false;
  let errorMessage = '';
  let lastSavedAssistantMsgId: string | null = null;
  // Dedup layer: skip duplicate tool_result events by tool_use_id
  const seenToolResultIds = new Set<string>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = value.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            if (event.type === 'permission_request' || event.type === 'tool_output') {
              // Skip permission_request and tool_output events - not saved as message content
            } else if (event.type === 'thinking') {
              // Accumulate thinking content with phase separation (--- between phases)
              if (thinkingPhaseEnded) {
                if (thinkingText) thinkingText += '\n\n---\n\n';
                thinkingPhaseEnded = false;
              }
              thinkingText += event.data;
            } else if (event.type === 'text') {
              currentText += event.data;
              if (thinkingText) thinkingPhaseEnded = true;
            } else if (event.type === 'tool_use') {
              if (thinkingText) thinkingPhaseEnded = true;
              // Flush any accumulated text before the tool use block
              if (currentText.trim()) {
                contentBlocks.push({ type: 'text', text: currentText });
                currentText = '';
              }
              try {
                const toolData = JSON.parse(event.data);
                contentBlocks.push({
                  type: 'tool_use',
                  id: toolData.id,
                  name: toolData.name,
                  input: toolData.input,
                });
              } catch {
                // skip malformed tool_use data
              }
            } else if (event.type === 'tool_result') {
              try {
                const resultData = JSON.parse(event.data);

                // Save media blocks to library, replace base64 with local paths
                let savedMedia: MediaBlock[] | undefined;
                if (Array.isArray(resultData.media) && resultData.media.length > 0) {
                  savedMedia = [];
                  for (const block of resultData.media as MediaBlock[]) {
                    if (block.data) {
                      try {
                        const saved = saveMediaToLibrary(block, { sessionId });
                        savedMedia.push({
                          type: block.type,
                          mimeType: block.mimeType,
                          localPath: saved.localPath,
                          mediaId: saved.mediaId,
                        });
                      } catch (saveErr) {
                        console.warn('[chat/route] Failed to save media block:', saveErr);
                        savedMedia.push(block); // Keep original if save fails
                      }
                    } else {
                      savedMedia.push(block);
                    }
                  }
                }

                const newBlock: MessageContentBlock = {
                  type: 'tool_result' as const,
                  tool_use_id: resultData.tool_use_id,
                  content: resultData.content,
                  is_error: resultData.is_error || false,
                  ...(savedMedia && savedMedia.length > 0 ? { media: savedMedia } : {}),
                };
                // Last-wins: if same tool_use_id already exists, replace it
                // (user handler's result may be more complete than PostToolUse's)
                if (seenToolResultIds.has(resultData.tool_use_id)) {
                  const idx = contentBlocks.findIndex(
                    (b) => b.type === 'tool_result' && 'tool_use_id' in b && b.tool_use_id === resultData.tool_use_id
                  );
                  if (idx >= 0) {
                    contentBlocks[idx] = newBlock;
                  }
                } else {
                  seenToolResultIds.add(resultData.tool_use_id);
                  contentBlocks.push(newBlock);
                }
              } catch {
                // skip malformed tool_result data
              }
            } else if (event.type === 'status') {
              // Capture SDK session_id and model from init event and persist them
              try {
                const statusData = JSON.parse(event.data);
                if (statusData.session_id) {
                  updateSdkSessionId(sessionId, statusData.session_id);
                }
                if (statusData.model) {
                  updateSessionModel(sessionId, statusData.model);
                }
              } catch {
                // skip malformed status data
              }
            } else if (event.type === 'error') {
              hasError = true;
              errorMessage = event.data || 'Unknown error';
            } else if (event.type === 'result') {
              try {
                const resultData = JSON.parse(event.data);
                if (resultData.usage) {
                  tokenUsage = resultData.usage;
                }
                if (resultData.is_error) {
                  hasError = true;
                }
                // Also capture session_id from result if we missed it from init
                if (resultData.session_id) {
                  updateSdkSessionId(sessionId, resultData.session_id);
                }
                // Memory flush tracking: log high turn counts for assistant sessions.
                // The progressive update instructions already tell the model to
                // proactively write important info to daily memory files.
                if (resultData.num_turns >= 25) {
                  console.log(`[chat API] High turn count (${resultData.num_turns}) for session ${sessionId}`);
                }
              } catch {
                // skip malformed result data
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    // Flush any remaining text
    if (currentText.trim()) {
      contentBlocks.push({ type: 'text', text: currentText });
    }

    // Prepend thinking block if accumulated during stream
    if (thinkingText.trim()) {
      contentBlocks.unshift({ type: 'thinking', thinking: thinkingText.trim() });
    }

    if (contentBlocks.length > 0) {
      // If the message is text-only (no tool calls), store as plain text
      // for backward compatibility with existing message rendering.
      // Strip soft-heartbeat marker from text blocks before persisting (both paths)
      const heartbeatMarkerRe = /\s*<!--\s*heartbeat-done\s*-->\s*/g;
      const cleanedBlocks = contentBlocks.map(b =>
        b.type === 'text' && 'text' in b ? { ...b, text: (b.text as string).replace(heartbeatMarkerRe, '') } : b
      );

      // If it contains tool calls or thinking blocks, store as structured JSON.
      const hasStructuredBlocks = cleanedBlocks.some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result' || b.type === 'thinking'
      );

      const content = hasStructuredBlocks
        ? JSON.stringify(cleanedBlocks)
        : cleanedBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();

      if (content) {
        const savedMsg = addMessage(
          sessionId,
          'assistant',
          content,
          tokenUsage ? JSON.stringify(tokenUsage) : null,
        );
        lastSavedAssistantMsgId = savedMsg.id;
      }
    }
  } catch (e) {
    hasError = true;
    errorMessage = e instanceof Error ? e.message : 'Stream reading error';
    // Stream reading error - best effort save (same structured-block handling as happy path)
    if (currentText.trim()) {
      contentBlocks.push({ type: 'text', text: currentText });
    }
    if (thinkingText.trim()) {
      contentBlocks.unshift({ type: 'thinking', thinking: thinkingText.trim() });
    }
    if (contentBlocks.length > 0) {
      const hbRe = /\s*<!--\s*heartbeat-done\s*-->\s*/g;
      const errCleanedBlocks = contentBlocks.map(b =>
        b.type === 'text' && 'text' in b ? { ...b, text: (b.text as string).replace(hbRe, '') } : b
      );
      const hasStructuredBlocks = errCleanedBlocks.some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result' || b.type === 'thinking'
      );
      const content = hasStructuredBlocks
        ? JSON.stringify(errCleanedBlocks)
        : errCleanedBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();
      if (content) {
        addMessage(sessionId, 'assistant', content);
      }
    }
  } finally {
    // ── Heartbeat / memory state updates ──
    try {
      const fullText = contentBlocks
        .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // 2a. Soft heartbeat: for normal turns in assistant projects, mark heartbeat done
      // only if the AI's response actually mentions heartbeat-related content.
      if (!opts?.isHeartbeatTurn && !hasError && fullText.trim().length > 0) {
        try {
          const workspacePath = getSetting('assistant_workspace_path');
          const session = getSession(sessionId);
          if (workspacePath && session && session.working_directory === workspacePath) {
            const { loadState, saveState, shouldRunHeartbeat } = await import('@/lib/assistant-workspace');
            const { getLocalDateString } = await import('@/lib/utils');
            const st = loadState(workspacePath);
            if (shouldRunHeartbeat(st)) {
              // Only mark done if the AI included the heartbeat-done marker.
              // The soft hint instructs the AI to append <!-- heartbeat-done --> when it checks in.
              const didCheck = fullText.includes('<!-- heartbeat-done -->');
              if (didCheck) {
                st.lastHeartbeatDate = getLocalDateString();
                saveState(workspacePath, st);
              }
            }
          }
        } catch { /* best effort */ }
      }

      // 2b. Heartbeat state update — ONLY for actual heartbeat turns, and ONLY on success
      if (opts?.isHeartbeatTurn && !hasError && fullText.trim().length > 0) {
        try {
          const workspacePath = getSetting('assistant_workspace_path');
          const session = getSession(sessionId);
          if (workspacePath && session && session.working_directory === workspacePath) {
            const { stripHeartbeatToken } = await import('@/lib/heartbeat');
            const { loadState, saveState } = await import('@/lib/assistant-workspace');
            const { getLocalDateString } = await import('@/lib/utils');
            const stripped = stripHeartbeatToken(fullText);

            const st = loadState(workspacePath);
            st.lastHeartbeatDate = getLocalDateString();

            if (stripped.shouldSkip && lastSavedAssistantMsgId) {
              // Pure HEARTBEAT_OK — mark ONLY the assistant reply as ack
              // (auto-trigger messages are not persisted, so we only have the reply)
              try {
                const { updateMessageHeartbeatAck } = await import('@/lib/db');
                updateMessageHeartbeatAck(lastSavedAssistantMsgId, true);
              } catch { /* best effort */ }
            } else if (!stripped.shouldSkip) {
              // Has real content — record for dedup
              st.lastHeartbeatText = stripped.text;
              st.lastHeartbeatSentAt = Date.now();
            }

            // Clear hookTriggeredSessionId
            if (st.hookTriggeredSessionId === sessionId || !st.hookTriggeredSessionId) {
              st.hookTriggeredSessionId = undefined;
              st.hookTriggeredAt = undefined;
            }
            saveState(workspacePath, st);
          }
        } catch {
          // best effort heartbeat state update
        }
      }
    } catch (e) {
      console.error('[chat API] Heartbeat state update failed:', e);
    }

    // Telegram notifications: completion or error (fire-and-forget)
    // Suppressed for auto-trigger turns (onboarding/heartbeat) — invisible system flows
    if (!opts?.suppressNotifications) {
      if (hasError) {
        notifySessionError(errorMessage, telegramOpts).catch(() => {});
      } else {
        const textSummary = contentBlocks
          .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();
        notifySessionComplete(textSummary || undefined, telegramOpts).catch(() => {});
      }
    }
    onComplete?.();
  }
}
