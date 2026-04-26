/**
 * Context Assembler — unified system prompt assembly for all entry points.
 *
 * Both browser chat (route.ts) and bridge (conversation-engine.ts) call this,
 * ensuring consistent context regardless of entry point.
 *
 * Layer injection is controlled by entry point type:
 *   Desktop: session + CLI tools + widget + dashboard
 *   Bridge:  session + CLI tools (no widget, no dashboard)
 */

import type { ChatSession } from '@/types';
import { getSetting } from '@/lib/db';

// ── Types ────────────────────────────────────────────────────────────

export interface ContextAssemblyConfig {
  /** The session from DB */
  session: ChatSession;
  /** Entry point: controls which layers are injected */
  entryPoint: 'desktop' | 'bridge';
  /** Current user prompt (used for widget keyword detection) */
  userPrompt: string;
  /** Per-request system prompt append (e.g., skill injection for image generation) */
  systemPromptAppend?: string;
  /** Conversation history (for widget keyword detection in resume context) */
  conversationHistory?: Array<{ role: string; content: string }>;
  /** Whether this is an image agent mode call */
  imageAgentMode?: boolean;
  /** Whether this is an auto-trigger turn */
  autoTrigger?: boolean;
}

export interface AssembledContext {
  /** Final assembled system prompt string, or undefined if no layers produced content */
  systemPrompt: string | undefined;
  /** Whether generative UI is enabled (affects widget MCP server + streamClaude param) */
  generativeUIEnabled: boolean;
}

// ── Main function ────────────────────────────────────────────────────

export async function assembleContext(config: ContextAssemblyConfig): Promise<AssembledContext> {
  const { session, entryPoint, systemPromptAppend } = config;
  const t0 = Date.now();

  // ── Prompt assembly: STATIC PREFIX → VOLATILE SUFFIX ──────────────
  //
  // Order matters for prompt cache: the API caches from the start of the
  // prompt. Stable content goes first so the prefix stays unchanged across
  // turns, maximizing cache hits. Volatile content (changes per turn or
  // per request) goes at the end.
  //
  // STATIC PREFIX (rarely changes within a session):
  //   1. WIDGET_SYSTEM_PROMPT — compile-time constant
  //   2. session.system_prompt — set at session creation
  //
  // VOLATILE SUFFIX (can change every turn):
  //   3. Dashboard summary — changes with widget operations
  //   4. systemPromptAppend — per-request (image agent mode, skills, etc.)

  const staticParts: string[] = [];
  const volatileParts: string[] = [];

  // [STATIC 1] Widget system prompt (desktop only) — compile-time constant
  const generativeUISetting = getSetting('generative_ui_enabled');
  const generativeUIEnabled = entryPoint === 'desktop' && generativeUISetting !== 'false';

  if (generativeUIEnabled) {
    try {
      const { WIDGET_SYSTEM_PROMPT } = await import('@/lib/widget-guidelines');
      staticParts.push(WIDGET_SYSTEM_PROMPT);
    } catch {
      // Widget prompt injection failed — don't block
    }
  }

  // [STATIC 2] Session system prompt — set once at session creation
  if (session.system_prompt) {
    staticParts.push(session.system_prompt);
  }

  // Widget MCP keyword detection is handled solely in claude-client.ts
  // where the actual MCP server registration happens.

  // [VOLATILE 3] Dashboard context (desktop only)
  if (entryPoint === 'desktop' && session.working_directory) {
    try {
      const { readDashboard } = await import('@/lib/dashboard-store');
      const config = readDashboard(session.working_directory);
      if (config.widgets.length > 0) {
        const summary = config.widgets.map((w, i) => `${i + 1}. ${w.title} — ${w.dataContract}`).join('\n');
        const trimmed = summary.length > 500 ? summary.slice(0, 500) + '...' : summary;
        volatileParts.push(`<active-dashboard>\nThe user has ${config.widgets.length} widget(s) pinned to their project dashboard:\n${trimmed}\n</active-dashboard>`);
      }
    } catch {
      // Dashboard read failed — don't block
    }
  }

  // [VOLATILE 4] Per-request append (image agent mode, skills, etc.)
  if (systemPromptAppend) {
    volatileParts.push(systemPromptAppend);
  }

  // Concatenate: static prefix + volatile suffix
  const allParts = [...staticParts, ...volatileParts].filter(Boolean);
  const finalSystemPrompt = allParts.length > 0 ? allParts.join('\n\n') : undefined;

  console.log(`[context-assembler] total: ${Date.now() - t0}ms (entry=${entryPoint}, prompt=${finalSystemPrompt?.length ?? 0} chars)`);

  return {
    systemPrompt: finalSystemPrompt,
    generativeUIEnabled,
  };
}
