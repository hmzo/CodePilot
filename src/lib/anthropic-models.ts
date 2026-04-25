/**
 * Anthropic 官方模型硬编码清单。
 *
 * 来源：https://docs.anthropic.com/en/docs/about-claude/models/overview
 * 最后核对：2026-04-25
 *
 * Claude Agent SDK 的 `query()` 接受这里的 alias，CodePilot 不再维护 provider/model
 * 数据库表，用户如需覆盖默认模型，可通过 `~/.claude/settings.json` 的 `model` 字段
 * 或环境变量 `ANTHROPIC_MODEL` 自定义。
 */

export interface BuiltInModel {
  /** SDK / API 接受的模型 ID */
  id: string;
  /** UI 展示名 */
  label: string;
  /** 用途分级，仅用于 UI 排序/分组提示 */
  tier: 'flagship' | 'balanced' | 'fast';
  /** 上下文窗口大小（tokens），仅用于 UI 提示 */
  contextWindow: number;
  /** 是否支持 extended-thinking / adaptive-thinking（用于 effort 选择器是否显示） */
  supportsThinking: boolean;
}

export const BUILT_IN_MODELS: readonly BuiltInModel[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    tier: 'balanced',
    contextWindow: 1_000_000,
    supportsThinking: true,
  },
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    tier: 'flagship',
    contextWindow: 1_000_000,
    supportsThinking: true,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    tier: 'fast',
    contextWindow: 200_000,
    supportsThinking: true,
  },
] as const;

export const DEFAULT_MODEL_ID: string = 'claude-sonnet-4-6';

/** localStorage key for user's last selected model */
export const SELECTED_MODEL_STORAGE_KEY = 'codepilot:selected-model';

export function findModel(id: string): BuiltInModel | undefined {
  return BUILT_IN_MODELS.find((m) => m.id === id);
}

export function getModelLabel(id: string): string {
  return findModel(id)?.label ?? id;
}
