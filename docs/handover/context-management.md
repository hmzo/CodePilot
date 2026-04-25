# 上下文管理系统 — 技术交接文档

> 产品思考见 [docs/insights/context-management.md](../insights/context-management.md) / [docs/insights/remove-provider.md](../insights/remove-provider.md)（链路下线背景）
> 2026-04-25 调整：随 provider 子系统下线，LLM 压缩链路（context-compressor.ts + PTL reactive compact）一并删除。压缩职能完全交给 Claude Code 的内置 `/compact` 命令；CodePilot 只保留"前置预估 + 消息归一化 + summary 注入"。

## 概述

CodePilot 用 Claude Agent SDK 与 Claude Code 通信。SDK 在 resume 失败时会回退到一次性发完整 prompt，因此 CodePilot 必须自己负责把"长对话历史 + 系统提示 + 用户消息"压到模型窗口内。

当前能力：

- **上下文预估** — 发送前估算 token 用量，前端展示用量环。
- **消息归一化** — 剥离元数据、摘要化工具调用、按年龄截断。
- **Session summary 注入** — 旧版 LLM 压缩遗留下的 `chat_sessions.context_summary` 列仍参与 fallback prompt 拼接，让 Claude Code 内置 `/compact` 写入的摘要也能被读到。

> **已移除**：自动 LLM 压缩、PTL（Prompt Too Long）reactive retry、压缩熔断器。

## 目录结构

```
src/lib/
├── context-estimator.ts      # Token 粗估 + 预算计算 + 状态判断
├── context-assembler.ts      # System prompt 静态/动态分离
├── message-normalizer.ts     # 消息清理 + Microcompaction
├── claude-client.ts          # buildFallbackContext（fallback prompt 拼接）
└── model-context.ts          # context_1m 感知

src/app/api/chat/
└── route.ts                  # 编排：预估 → fallback budget → streamClaude

src/hooks/
└── useContextUsage.ts        # 双指标计算（实际 + 预估）

src/components/chat/
└── ContextUsageIndicator.tsx # 环形进度 + HoverCard 详情
```

## 模块职责

### context-estimator.ts

纯计算模块，无副作用，无网络调用。

- `roughTokenEstimate(text, isJson?)` — 4 bytes/token（JSON 2 bytes/token），基于 `Buffer.byteLength`
- `estimateMessageTokens(content)` — 自动检测 JSON 内容
- `estimateContextTokens(params)` — 聚合 system + history + userMessage + summary 的总估算
- `calculateContextPercentage(tokens, window)` — 返回 percentage + state (normal/warning/critical)

阈值：warning >= 80%, critical >= 95%。

### message-normalizer.ts

两层处理管线：

1. **normalizeMessageContent(role, raw)** — 始终应用：
   - 剥离 `<!--files:...-->` 内部元数据
   - assistant JSON 消息：提取 text block + tool_use 摘要（`(used tool_name: truncated_input)`）
   - tool_result block 被跳过（intent 已由 tool_use 摘要覆盖）

2. **microCompactMessage(role, content, ageFromEnd)** — fallback 路径应用：
   - 近 30 条消息：5000 字符上限
   - 超过 30 条的旧消息：1000 字符上限
   - Head+Tail 截断策略（70% 头部 + 30% 尾部 + `[...truncated...]` 标记）

### context-assembler.ts

把 system prompt 切成静态 / 动态两段，最大化 Anthropic prompt cache 命中率：

**静态前缀**（跨请求稳定）：
1. WIDGET_SYSTEM_PROMPT — 编译时常量
2. session.system_prompt — 创建时设置
3. Workspace identity files — 文件修改时才变

**动态后缀**（每轮可能变化）：
4. Memory hint
5. Dashboard summary
6. systemPromptAppend — 每请求注入（技能、工具上下文等）

### claude-client.ts → buildFallbackContext

```
输入：prompt, history, sessionSummary, tokenBudget
│
├── 无历史 → 直接返回 prompt（带 sessionSummary 包裹）
├── normalize + microCompact 每条消息（按年龄分级）
├── token 预算截断（从最新往回累加，budget 下限 10K）
├── 组装输出：
│   ├── <conversation_summary>（如有 summary）
│   ├── <conversation_history>（Human/Assistant 交替）
│   └── Human: {当前 prompt}
└── 返回完整 prompt 字符串
```

只在 SDK resume 失败时使用——正常流程下 SDK 直接读 `~/.claude` 维护的会话状态。

## DB Schema

`chat_sessions` 现存两列保留：

| 列 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| context_summary | TEXT | '' | Claude Code `/compact` 命令写入的对话摘要 |
| context_summary_updated_at | TEXT | '' | 摘要最后更新时间 |

相关函数：
- `getSessionSummary(sessionId)` → `{ summary, updatedAt }`
- `updateSessionSummary(sessionId, summary)` — 同时写入时间戳

> 旧版 `context-compressor.ts` 会主动写入这个列；现在主要由 Claude Code 内置压缩命令自己维护。

## 关键设计决策

### 静态/动态 prompt 分离

稳定内容在前，Anthropic API 的 prompt cache 从头部开始匹配，最大化缓存命中。

### Microcompaction 年龄阈值

两级截断策略：
- 最近 30 条消息：每条最多 5000 字符（`RECENT_CONTENT_LIMIT`）
- 更老的消息：每条最多 1000 字符（`OLD_CONTENT_LIMIT`）

Head+Tail 截断保留头部结构 + 尾部最新内容。30 条是经验值——大多数用户在 30 轮内完成一个任务，更早的消息通常只需保留概要。

### 媒体项数量限制

API 硬限制 100 个媒体项。实现策略：
- 计数超过 100 时，`slice(-MAX_MEDIA_ITEMS)` 保留最新的
- 被丢弃的旧图片在 content blocks 中添加文本说明
- 文本引用（file path reference）只为实际包含的图片生成

保留最新（而非最旧）与"近期上下文更重要"的整体策略一致。

## 前端

### ContextUsageIndicator

环形 SVG 进度圈 + HoverCard 浮层，显示：
- 模型名 + 上下文窗口大小
- 实际用量（from last API response token_usage）
- 百分比
- 下一轮预估（current input + this output + 200 overhead）
- Cache 明细（read / creation / output）
- hasSummary 标记（绿色 "Active" 标签）
- Warning/Critical 提示文字

**双指标设计**：warning state 取实际 ratio 和预估 ratio 中较高者。这解决了"当前轮还没到 80%，但下一轮必然超"的场景。

### hasSummary 检测

`ChatView` 从 DB 读取 `getSessionSummary(sessionId).summary`，传入 `ContextUsageIndicator`。Claude Code 内置 compact 命令更新摘要后，下一次 `/api/chat` 请求自然会读到。

## 已知局限

1. **Token 估算是粗估** — 4B/tok 对非英文内容偏差较大（中文可能 2-3B/tok），但精确计数需要 API 调用，增加延迟。
2. **无 prompt cache 精细控制** — SDK preset append 模式不暴露 `cache_control` API。
3. **没有 GUI 触发的 compact** — 删除 LLM 压缩链路后，CodePilot 自身不再主动压缩；用户需要在 `/chat` 输入框直接发 `/compact` 命令让 Claude Code 自己处理。
4. **没有 PTL retry** — API 返回 prompt_too_long 时直接抛错给前端展示，不再自动 fallback retry。
5. **媒体项硬限制 100** — 命中后旧图片会被丢弃。

## 关键文件索引

| 用途 | 文件 |
|------|------|
| Token 估算 | `src/lib/context-estimator.ts` |
| 消息归一化 | `src/lib/message-normalizer.ts` |
| System prompt 分离 | `src/lib/context-assembler.ts` |
| Fallback prompt 拼接 | `src/lib/claude-client.ts` |
| 编排 | `src/app/api/chat/route.ts` |
| 前端指标计算 | `src/hooks/useContextUsage.ts` |
| 前端 UI | `src/components/chat/ContextUsageIndicator.tsx` |
| DB schema + 读写 | `src/lib/db.ts` |
| 单元测试 | `src/__tests__/unit/message-normalizer.test.ts`, `context-estimator.test.ts` |
