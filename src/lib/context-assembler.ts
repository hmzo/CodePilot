/**
 * Context Assembler — unified system prompt assembly for all entry points.
 *
 * Extracts the 5-layer prompt assembly logic from route.ts into a pure async
 * function. Both browser chat (route.ts) and bridge (conversation-engine.ts)
 * call this, ensuring consistent context regardless of entry point.
 *
 * Layer injection is controlled by entry point type:
 *   Desktop: workspace + session + assistant instructions + CLI tools + widget
 *   Bridge:  workspace + session + assistant instructions + CLI tools (no widget)
 */

import type { ChatSession } from '@/types';
import { getSetting } from '@/lib/db';

// ── Types ────────────────────────────────────────────────────────────

export interface ContextAssemblyConfig {
  /** The session from DB */
  session: ChatSession;
  /** Entry point: controls which layers are injected */
  entryPoint: 'desktop' | 'bridge';
  /** Current user prompt (used for workspace retrieval + widget keyword detection) */
  userPrompt: string;
  /** Per-request system prompt append (e.g., skill injection for image generation) */
  systemPromptAppend?: string;
  /** Conversation history (for widget keyword detection in resume context) */
  conversationHistory?: Array<{ role: string; content: string }>;
  /** Whether this is an image agent mode call */
  imageAgentMode?: boolean;
  /** Whether this is an auto-trigger turn (onboarding hook, etc.) */
  autoTrigger?: boolean;
}

export interface AssembledContext {
  /** Final assembled system prompt string, or undefined if no layers produced content */
  systemPrompt: string | undefined;
  /** Whether generative UI is enabled (affects widget MCP server + streamClaude param) */
  generativeUIEnabled: boolean;
  /** Onboarding/checkin instructions (route.ts uses this for server-side completion detection) */
  assistantProjectInstructions: string;
  /** Whether this session is in the assistant workspace */
  isAssistantProject: boolean;
}

// ── Main function ────────────────────────────────────────────────────

export async function assembleContext(config: ContextAssemblyConfig): Promise<AssembledContext> {
  const { session, entryPoint, systemPromptAppend } = config;
  const t0 = Date.now();

  let workspacePrompt = '';
  let memoryHint = '';
  let assistantProjectInstructions = '';
  let isAssistantProject = false;

  // ── Layer 1: Workspace prompt (if assistant project session) ──────
  try {
    const workspacePath = getSetting('assistant_workspace_path');
    if (workspacePath) {
      const sessionWd = session.working_directory || '';
      isAssistantProject = sessionWd === workspacePath;

      if (isAssistantProject) {
        const { loadWorkspaceFiles, assembleWorkspacePrompt, loadState } =
          await import('@/lib/assistant-workspace');

        // Incremental reindex BEFORE MCP search so tool calls see latest content.
        // Timeout after 5s to prevent blocking on large workspaces (e.g. Obsidian vaults).
        try {
          const { indexWorkspace } = await import('@/lib/workspace-indexer');
          const indexStart = Date.now();
          indexWorkspace(workspacePath);
          const indexMs = Date.now() - indexStart;
          if (indexMs > 3000) {
            console.warn(`[context-assembler] Workspace indexing took ${indexMs}ms — consider reducing workspace size`);
          }
        } catch {
          // indexer not available or timed out, skip — MCP search will use stale index
        }

        const files = loadWorkspaceFiles(workspacePath);

        // Memory/retrieval is handled by codepilot_memory_search MCP tool.
        // assembleWorkspacePrompt only includes identity files (soul/user/claude).
        // We also inject a lightweight "memory availability hint" so AI knows
        // what's available without loading full content.
        workspacePrompt = assembleWorkspacePrompt(files);

        // Memory availability hint — stored separately as volatile content
        // (changes daily, should not invalidate the static identity prefix cache)
        try {
          const { loadDailyMemories } = await import('@/lib/assistant-workspace');
          const recentDays = loadDailyMemories(workspacePath, 5);
          if (recentDays.length > 0) {
            const dateList = recentDays.map(d => d.date).join(', ');
            memoryHint = `<memory-hint>Recent daily memories available: ${dateList}. Use codepilot_memory_recent to review them.</memory-hint>`;
          }
        } catch {
          // skip if daily memories unavailable
        }

        const state = loadState(workspacePath);

        if (!state.onboardingComplete) {
          assistantProjectInstructions = buildOnboardingInstructions();
        } else {
          assistantProjectInstructions = buildProgressiveUpdateInstructions();
        }
      }
    }
  } catch (e) {
    console.warn('[context-assembler] Failed to load assistant workspace:', e);
  }

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
  //   3. Workspace identity (soul/user/claude.md) — changes only when files edited
  //
  // VOLATILE SUFFIX (can change every turn):
  //   4. Memory hint — changes daily
  //   5. Assistant instructions — depends on onboarding state
  //   6. Dashboard summary — changes with widget operations
  //   7. systemPromptAppend — per-request (image agent mode, skills, etc.)

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

  // [STATIC 3] Workspace identity files (soul/user/claude.md)
  // Note: workspacePrompt was computed earlier WITHOUT memory hint (identity only)
  if (workspacePrompt) {
    staticParts.push(workspacePrompt);
  }

  // [VOLATILE 4] Memory hint — changes daily
  if (memoryHint) {
    volatileParts.push(memoryHint);
  }

  // [VOLATILE 5] Assistant project instructions — state-dependent
  if (assistantProjectInstructions) {
    volatileParts.push(assistantProjectInstructions);
  }

  // Widget MCP keyword detection is handled solely in claude-client.ts
  // where the actual MCP server registration happens.

  // [VOLATILE 6] Dashboard context (desktop only)
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

  // [VOLATILE 7] Per-request append (image agent mode, skills, etc.)
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
    assistantProjectInstructions,
    isAssistantProject,
  };
}

// ── Instruction templates ────────────────────────────────────────────

function buildOnboardingInstructions(): string {
  return `<assistant-project-task type="onboarding">
你正在进行助理工作区的首次设置。通过自然对话了解用户，围绕以下主题展开：

1. 关于你：怎么称呼你？你的角色和主要工作是什么？有什么偏好？
2. 关于我：你希望我是什么风格？有什么边界和禁区？
3. 关于工作区：你的文件和笔记怎么组织？有什么习惯？

规则：
- 用自然对话方式展开，不要一次列出所有问题
- 每轮只问 1-2 个相关的问题，根据用户的回答深入
- **严格控制问题数量**：3 轮对话（约 3-5 个问题）就足够了。不要问超过 5 个问题。
- 3 轮后主动询问"还有什么要补充的吗？如果没有我就开始设置了"
- 用户表示 OK/可以了/差不多了/够了/没了 → 立即进入完成流程
- 用户主动继续聊 → 可以继续，但不要主动追加更多问题
- 用户明确说结束 → 立即进入完成流程
- 完成时输出以下格式，JSON 中的 key 可以自由命名，涵盖你收集到的所有信息：

\\\`\\\`\\\`onboarding-complete
{"name":"用户称呼","assistant_name":"助理名字","style":"沟通风格偏好","boundaries":"边界和禁区","goals":"当前目标","organization":"工作区组织方式","preferences":"其他偏好"}
\\\`\\\`\\\`

- 输出 fence 后，明确告知用户："初始设置完成！我已经根据我们的对话生成了配置文件。从现在开始，我会按照这些设置来帮你。"
- 不要自己写文件，系统会自动从你收集的信息生成 soul.md、user.md、claude.md 和 memory.md
- 整个过程保持友好、自然，像两个人第一次认识在聊天
</assistant-project-task>`;
}

function buildProgressiveUpdateInstructions(): string {
  return `<assistant-memory-guidance>
## 记忆与文件更新

你可以在对话中随时更新 workspace 文件来记住重要信息：

### 身份文件（修改后必须告知用户）
- soul.md：你的风格和行为规则变化时更新
- user.md：用户画像变化时更新
- claude.md：执行规则变化时更新

### 记忆文件（可以静默更新）
- memory.md：追加稳定的事实和偏好（只追加，不覆写）
- memory/daily/{日期}.md：记录今天的工作和决策

### 更新判断标准
- 用户明确要求记住/修改某规则 → 立即更新
- 用户连续表达同一偏好 → 写入 user.md 或 soul.md
- 重要决策或经验总结 → 写入 memory.md
- 日常工作记录 → 写入 daily memory
- 不确定是否值得记录 → 先不写，多观察

### 禁止
- 不要在身份文件中存储敏感信息（密码、API key）
- 不要覆写 memory.md 已有内容（只追加）
- 不要在没有告知用户的情况下修改 soul/user/claude.md
</assistant-memory-guidance>`;
}
