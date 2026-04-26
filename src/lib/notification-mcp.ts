/**
 * codepilot-notify MCP — in-process MCP server for notifications.
 *
 * Provides 1 tool:
 * - codepilot_notify: Send an immediate notification
 *
 * Globally registered: available in all contexts (no keyword gating).
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const NOTIFICATION_MCP_SYSTEM_PROMPT = `## 通知

你可以通过 codepilot_notify 立即发送通知给用户（支持系统通知和应用内提示）。

使用场景：
- 任务完成需要告知用户 → 用 codepilot_notify`;

export function createNotificationMcpServer() {
  return createSdkMcpServer({
    name: 'codepilot-notify',
    version: '1.0.0',
    tools: [
      tool(
        'codepilot_notify',
        'Send an immediate notification to the user. Supports system notification, in-app toast, and Telegram (for urgent). Use when a task completes, something needs attention, or user asked to be notified.',
        {
          title: z.string().describe('Notification title'),
          body: z.string().describe('Notification body text'),
          priority: z.enum(['low', 'normal', 'urgent']).optional().default('normal')
            .describe('low=toast only, normal=toast+system, urgent=toast+system+telegram'),
        },
        async ({ title, body, priority }) => {
          try {
            const { sendNotification } = await import('@/lib/notification-manager');
            await sendNotification({ title, body, priority });
            return { content: [{ type: 'text' as const, text: `Notification sent: "${title}"` }] };
          } catch (err) {
            return { content: [{ type: 'text' as const, text: `Failed to send notification: ${err instanceof Error ? err.message : 'unknown'}` }] };
          }
        },
      ),
    ],
  });
}
