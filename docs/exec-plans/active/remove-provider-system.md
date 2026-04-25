# 移除 Provider 系统 / Remove Provider System

> 创建时间：2026-04-25
> 最后更新：2026-04-25

## 目标

让 CodePilot 退化为一个"包了 GUI 的 `claude` CLI"：所有 LLM 调用都通过 Claude Agent SDK 的 `query()` 走，凭据 / base_url / 默认模型完全由用户的 `~/.claude/settings.json`（或登录态 credentials）决定，CodePilot 自己不再管理任何 provider 配置。

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | POC + 模型清单调研 | ✅ 已完成 | 2026-04-25 通过 WebSearch + Anthropic 官方文档确认最新模型 ID；POC 在 phase1.2 改造时直接验证 |
| Phase 1.1 | anthropic-models.ts + ModelSelectorDropdown + MessageInput 改造 | ✅ 已完成 | 新建 `src/lib/anthropic-models.ts` 硬编码 Sonnet/Opus/Haiku；ModelSelectorDropdown 改用 BUILT_IN_MODELS |
| Phase 1.2 | claude-client.ts 解耦 toClaudeCodeEnv | ✅ 已完成 | env 不再注入 ANTHROPIC_*；`settingSources` 固定 `[user, project, local]`；移除 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` |
| Phase 1.3 | api/chat/route.ts 去掉 provider_id 入参 | ✅ 已完成 | `SendMessageRequest` 删 `provider_id`；streamClaude 直接传 model |
| Phase 1.4 | chat/page.tsx + ChatView + AssistantWorkspaceSection 改造 | ✅ 已完成 | 移除 `codepilot:last-provider-id` / `provider-changed` 事件 / stale-default 修复；改用 `codepilot:selected-model` |
| Phase 1 验收 | dev + chrome-devtools + npm run test | ✅ 已完成 | typecheck + 单测全部通过 |
| Phase 2.1 | DB 迁移：DROP api_providers + provider_models + 6 个 settings 键 | ✅ 已完成 | `chat_sessions.provider_id / provider_name` 列保留为 dead column |
| Phase 2.2 | 删除 provider-resolver / provider-catalog / provider-doctor / resolve-session-model | ✅ 已完成 | 全部删除；连带 `useProviderModels` hook |
| Phase 2.3 | 删除 api/providers/ + api/doctor/ 路由 | ✅ 已完成 | 11 个 route 文件全部删除 |
| Phase 2.4 | 删除 ProviderManager / ProviderForm / ProviderDoctorDialog 等组件 | ✅ 已完成 | SettingsLayout 已无 providers section |
| Phase 2.5 | 类型 + i18n 清理 | ✅ 已完成 | `ApiProvider` 系列类型全部删除；i18n 删除 settings.providers / provider.* / setup.provider.* / messageInput.doctorDesc / error.providerUnavailable |
| Phase 3.1 | 删除 text-generator / onboarding-processor / checkin-processor / context-compressor / task-scheduler / memory-extractor / memory-search-mcp | ✅ 已完成 | claude-client.ts 移除 memory MCP 注册 |
| Phase 3.2 | 删除 api/workspace/{onboarding,checkin,quick-actions} + api/tasks + api/media/jobs/plan | ✅ 已完成 | 路由全部删除 |
| Phase 3.3 | 删除 QuickActions 组件 + AssistantWorkspaceSection 中的 onboarding/checkin/scheduler 入口 + 批量生图 plan 阶段 UI | ✅ 已完成 | 对应 i18n 键全部清理 |
| Phase 4 | Bridge 配置精简：仅保留 bridge_default_model 文本框 | ✅ 已完成 | `bridge_default_provider_id` 从白名单和 channel-router 删除 |
| Phase 5 | 测试 / 文档清理 / 移到 completed/ | 📋 进行中 | 测试 + handover 文档已清理；ARCHITECTURE / README 待最终核对 |
| Phase 6 | 收尾：完整测试 + DB 重置验证 + 产品思考文档 | 📋 待开始 | |

## 决策日志

- **2026-04-25**: 采用 `scope=full-delete` 策略（用户决定）：DB 表 / API / UI / 类型 / 测试 / 文档全部清理。
- **2026-04-25**: `model-selector=keep-hardcoded`：保留模型选择器，硬编码 Anthropic 官方模型清单，通过 SDK `model` 选项传入。
- **2026-04-25**: `aux-ai=delete-features`：onboarding / checkin / quick-actions / scheduler / memory-extractor / context-compressor / batch-plan 整体下线。
- **2026-04-25**: `bridge=keep-bridge-model-only`：去掉 `bridge_default_provider_id`，保留 `bridge_default_model`（文本输入）。
- **2026-04-25**: `data-migration=drop-tables`：DROP `api_providers` + `provider_models`；`chat_sessions.provider_id / provider_name` 列保留为 dead column（SQLite DROP COLUMN 兼容性虽好但写迁移更复杂）。
- **2026-04-25**: 通过 [Anthropic 官方文档](https://docs.anthropic.com/en/docs/about-claude/models/overview) 确认 2026-04 最新模型 ID（详见下方"模型清单调研"）。

## 模型清单调研（Phase 0 输出）

来源：<https://docs.anthropic.com/en/docs/about-claude/models/overview>（2026-04-25 抓取）

**当前主推模型（Latest models）：**

| ID | Alias | Tier | Context | Max output |
|----|-------|------|---------|-----------|
| `claude-opus-4-7` | `claude-opus-4-7` | flagship | 1M | 128k |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` | balanced (default) | 1M | 64k |
| `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | fast | 200k | 64k |

**额外保留的旧版（仍可用，不在内置清单里，由用户在 `~/.claude/settings.json` 自由覆盖）：**

- `claude-sonnet-4-5` / `claude-opus-4-5` / `claude-opus-4-1` / `claude-opus-4-6`

**硬编码方案（`src/lib/anthropic-models.ts`）：**

```typescript
export const BUILT_IN_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'balanced' },
  { id: 'claude-opus-4-7',   label: 'Opus 4.7',   tier: 'flagship' },
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5',  tier: 'fast' },
] as const;
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';
```

`localStorage` 改用单一键 `codepilot:selected-model`（值就是 SDK model id），不再有 `codepilot:last-provider-id`。

## POC 结论（Phase 0 输出）

无需独立 POC 步骤。Claude Agent SDK 的 `query()` 在 `settingSources: ['user', 'project', 'local']` 模式下直接读 `~/.claude/settings.json` 与登录态 credentials，本身就是其设计目的。当前代码里的 `toClaudeCodeEnv` 注入 `ANTHROPIC_*` + `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` 是**为了覆盖**用户的 `~/.claude` 配置——一旦移除注入并保留 `settingSources`，SDK 会自然读取用户配置。这就是计划要做的事。Phase 1.2 实施后通过 chrome-devtools MCP 实测验证。

## 详细设计

### Before / After 数据流

```
Before:
  MessageInput → POST /api/chat (provider_id, model)
              → resolveProviderUnified
              → DB(api_providers, provider_models, settings.global_*)
              → toClaudeCodeEnv (注入 ANTHROPIC_API_KEY/BASE_URL/MODEL/...)
              → SDK query()

After:
  MessageInput → POST /api/chat (model)
              → streamClaude { model }
              → SDK query() (options.model + settingSources:[user,project,local])
              ↘ 读 ~/.claude/settings.json
```

### 改动范围地图

**完全删除：**

- `src/lib/`: provider-resolver / provider-catalog / provider-doctor / text-generator / onboarding-processor / checkin-processor / context-compressor / task-scheduler / memory-extractor / memory-search-mcp / resolve-session-model
- `src/hooks/useProviderModels.ts`
- `src/app/api/`: providers/** + doctor/** + workspace/{onboarding,checkin,quick-actions}/** + tasks/** + media/jobs/plan
- `src/components/settings/`: Provider* + ProviderDoctorDialog + PresetConnectDialog
- `src/components/setup/ProviderCard.tsx`
- `src/components/chat/QuickActions.tsx`

**改造保留：**

- `src/lib/db.ts`：drop tables + 清理 settings 键 + 删除所有 provider/model 相关函数
- `src/lib/claude-client.ts`：去掉 toClaudeCodeEnv 调用
- `src/components/chat/ModelSelectorDropdown.tsx`：硬编码模型清单
- `src/components/chat/MessageInput.tsx`：去掉 provider 概念
- `src/app/api/chat/route.ts`：去掉 provider_id 入参
- `src/components/bridge/BridgeSection.tsx`：仅 bridge_default_model 文本框
- `src/lib/bridge/{channel-router,conversation-engine}.ts`：去 provider 解析

## 验收标准

- 用户 `~/.claude` 已配置 `ANTHROPIC_AUTH_TOKEN`（或登录态）后，CodePilot 启动直接能聊天，不需要任何 provider 配置 UI
- 模型选择器切换 sonnet/opus/haiku 后，下一条消息走对应模型（通过 status 事件的 `model` 字段或服务器日志验证）
- 设置页 providers section 完全消失，无 dead link
- `npm run test` + `npm run test:smoke` 全绿
- 删除 `~/.codepilot/codepilot.db` 后重新启动能干净地初始化新 schema
