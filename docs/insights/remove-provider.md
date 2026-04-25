# 移除 Provider 子系统 — 产品思考

> 技术实现见 [docs/handover/onboarding-setup-center.md](../handover/onboarding-setup-center.md)（凭据检测）、[docs/handover/bridge-system.md](../handover/bridge-system.md)（Bridge 配置精简）、[docs/handover/context-management.md](../handover/context-management.md)（LLM 压缩链路下线）
> 执行计划见 [docs/exec-plans/active/remove-provider-system.md](../exec-plans/active/remove-provider-system.md)
> 决策日期：2026-04-25

## 解决了什么用户问题

CodePilot 历史上自己维护了一套 provider 子系统：DB 里有 `api_providers` / `provider_models` 表、UI 里有"服务商管理"页、API 里有 `/api/providers/*` 路由、运行时有 `resolveProviderUnified` + `toClaudeCodeEnv` 把凭据 / base_url / 默认模型注入到 Claude Agent SDK 的环境变量里。这套系统的初衷是好的——让用户能在一个 GUI 里配置多个 AI 服务商，灵活切换 Anthropic 官方 / OpenRouter / 智谱 / 火山 / Bedrock 等。

但实际运营两个月后，从 GitHub Issues 数据复盘（详见 [user-audience-analysis.md](./user-audience-analysis.md)），它带来了三类问题：

1. **配置二义性导致的"路由错乱"** — 用户 `~/.claude/settings.json` 里写了一份 `ANTHROPIC_BASE_URL`，CodePilot DB 里存了另一份 provider 配置；两套配置同时存在时，新会话的请求究竟走哪边、靠的是 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` 这个隐式开关。Issue #30 / #302 反复出现"我加了 API key 但模型调不通"，根因都是这个二义性。
2. **第三方 provider 兼容性是无底洞** — 不同网关对 `appendSystemPrompt` 的处理、对 `cache_control` 的支持、对 stream 协议的兼容、对工具 schema 的转译都不一致。每多支持一个 provider 就多一组 issue。
3. **辅助 AI 功能的双链路成本** — onboarding / checkin / quick-actions / scheduler / memory-extractor / context-compressor / batch-plan 这些"AI 帮你做事"的功能，没法直接复用 Claude Agent SDK 的 chat 流（它走的是 `claude` CLI subprocess），只能走 `@ai-sdk/anthropic` 直连 API。这意味着每个辅助功能都要：① 自己解析 provider 配置；② 自己处理凭据；③ 自己处理代理；④ 自己处理错误。维护成本几乎和主链路同量级。

## 为什么是"删除"而不是"修复"

我们认真考虑过几种修复方案：

| 方案 | 评估 |
|------|------|
| 把 DB provider 配置改为只读（从 `~/.claude` 同步） | 治标不治本——双链路存在的核心成本并没有降低，UI 还要维护一份"展示用"的服务商列表 |
| 把 `~/.claude` 作为唯一真相源，DB 只缓存 | 缓存一致性是另一个无底洞，不如不缓存 |
| 给每个辅助 AI 功能写"如果没 provider 就跳过"的容错 | 这些功能本身用户反馈一般，不值得为它们单独维护一条链路 |
| **彻底退化为 "Claude Code 的 GUI 客户端"** ✅ | 一次性消除二义性、双链路、第三方网关兼容性这三类成本 |

最终选择了第四种。这意味着 CodePilot 主动放弃了"多 provider 是核心差异化"这个原本写在 README 里的卖点，但换来了：

- **凭据有且仅有一处** — `~/.claude/settings.json` 是唯一真相源
- **base_url / 模型选择 / 凭据** 全部交给 Claude Agent SDK 的 `settingSources: ['user', 'project', 'local']` 自动读取
- **第三方网关兼容性** 不再是 CodePilot 的问题——用户在 `~/.claude` 里怎么配，模型行为就是怎么样
- **辅助 AI 功能链路** 全部下线（用户反馈一般、维护成本高），需要"AI 帮我做事"的时候直接在 `/chat` 输入框里给 Claude 发指令

## 设计取舍

### 模型选择器：保留 vs 删除

**保留**——但改为硬编码 Anthropic 官方清单（Sonnet / Opus / Haiku）通过 SDK `model` 选项传入。

理由：
- 用户对"我现在用的是哪个模型"还是有强感知需求（速度/价格/能力差异巨大）
- SDK 的 `model` 选项是公共 API，不依赖 provider 概念，可以直接传
- 硬编码列表的维护成本极低（Anthropic 官方模型也就 3-5 个），跟着 Anthropic 文档走即可
- 第三方网关用户：网关侧通常会把 `claude-sonnet-4-5` 转译成它自己的模型 ID，CodePilot 只管按官方 ID 传过去

### 数据迁移：drop-tables vs export-to-json

**drop-tables**——`api_providers` / `provider_models` / `tasks` / `scheduled_tasks` / `task_run_logs` 全部直接 DROP，不导出。

理由：
- 用户从 CodePilot 0.46 升级时，他们的 `~/.claude/settings.json` 里大概率已经有同样的凭据（用户在终端用过 `claude` CLI），不需要"备份恢复"
- 真正没在 `~/.claude` 里配置的用户，删除后会在第一次发消息时收到清晰的"请去 `~/.claude` 配置"提示，比留一份过期 JSON 备份更友好
- 写"导出 → 备份 → 提示用户手动迁移到 ~/.claude"的代码量约等于直接 DROP 的 5 倍，且很可能用户也不会真的去看那个备份

**保留 dead column**：`chat_sessions.provider_id` / `provider_name` 列保留不删。SQLite DROP COLUMN 兼容性虽好但写迁移更复杂；保留两个空列对功能毫无影响，省下来的迁移代码可以做更有价值的事。

### Bridge 子系统：精简 vs 删除

**精简**——保留 `bridge_default_model`（文本输入），删除 `bridge_default_provider_id`。

理由：
- IM Bridge 是 CodePilot 的核心差异化（远程通过 Telegram / 飞书 / Discord / QQ / 微信遥控 Claude Code），不能随 provider 子系统一起删
- Bridge 创建会话时还是需要"指定一个默认模型"——但既然全局也是硬编码模型，Bridge 这里降级为一个普通的文本输入即可（用户输入啥就传啥，由 SDK 处理校验）

### 辅助 AI 功能：保留哪些 / 删除哪些

| 功能 | 决策 | 理由 |
|------|------|------|
| Onboarding（13 题问卷 / 对话式 bootstrap） | ❌ 删除 | 用户反馈"每次新装都跑一遍很烦"，且 Claude Code 自己就能在第一轮对话里学会用户偏好 |
| Check-in / 心跳问询 UI | ❌ 删除 | 同上；`heartbeat.md` 文件本身保留供模型自主读取 |
| Quick Actions | ❌ 删除 | 用户使用率低；一个按钮调一个 prompt 远不如直接在输入框打字灵活 |
| Task Scheduler（定时任务） | ❌ 删除 | 跟 buddy 心跳系统职责重叠；buddy 系统已经解决了"定时唤起"问题 |
| Memory Extractor（自动记忆提取） | ❌ 删除 | 误报率高，且 Claude 现在能自己 `Edit memory.md` |
| Memory Search MCP | ❌ 删除 | Claude Code 自带 `Read`/`Grep` 工具直接读 `memory.md` 即可 |
| Context Compressor（自动压缩） | ❌ 删除 | Claude Code 内置 `/compact` 命令更好用 |
| Batch Image Generation Planning（批量生图规划阶段） | ❌ 删除 | 依赖 `text-generator.ts`；用户可以手动列清单 |
| **图片生成主链路** | ✅ 保留 | `codepilot_generate_image` MCP / 设计 Agent 流程不依赖 provider 配置（直接读 `~/.claude` 里的 Gemini / Anthropic API key） |
| **Buddy 系统** | ✅ 保留 | 不依赖 provider；心跳改用本地定时器替代 TaskScheduler |
| **Generative UI / Widget 系统** | ✅ 保留 | 不依赖 provider；只是给 system prompt 加 widget 指令 |
| **Dashboard / 项目看板** | ✅ 保留 | 不依赖 provider |
| **`codepilot-notify` 通用通知 MCP** | ✅ 保留 | 不依赖 provider；服务于 buddy 系统 |
| **Skills / MCP 管理** | ✅ 保留 | 这是 Claude Code 自身的能力，CodePilot 只是 GUI 包装 |
| **Bridge 子系统** | ✅ 保留（精简） | 见上一节 |

## 用户感知到什么变化

### 升级用户

第一次打开 v0.47 时：
- 设置页"服务商"标签消失
- 模型选择器只显示 Sonnet / Opus / Haiku 三个 Anthropic 官方模型
- 助理工作区不再有"重新引导"按钮，改为"开启新会话（保留文件）"
- 看板上 onboarding / checkin / scheduler 卡片消失

如果用户的 `~/.claude/settings.json` 已经有凭据（他们在终端用过 `claude`），无缝继续工作。
如果没有，第一次发消息时收到 console warn 提示："在 `~/.claude` 里配置 ANTHROPIC_AUTH_TOKEN 或先 `claude` 登录"。

### 新用户

第一次打开 v0.47 时：
- Setup Center 只引导两件事：① 安装并登录 Claude Code CLI；② 选择默认项目目录
- 不再有"输入 API key"的步骤——这一步彻底交给 `claude` CLI 处理

## 已知局限

1. **没有"应用内可视化的服务商切换"** — 用户想在 OpenRouter 和官方 API 之间切换，必须手动改 `~/.claude/settings.json`。这是有意识的取舍：我们认为服务商切换是低频操作（用户配一次用半年），不值得为此维护一套 UI。
2. **第三方网关兼容性问题** — 比如 widget 系统的 `appendSystemPrompt` 字段被某些网关丢弃——这类问题现在直接显现给用户（"为什么我用 OpenRouter 时 widget 不工作？"），CodePilot 不再尝试在中间层修复，只能在文档里说明"建议使用 Anthropic 官方 API"。
3. **辅助 AI 功能用户回不去** — 重度依赖 onboarding 问卷生成 soul.md 的用户，升级后只能手写或让 Claude 在对话里帮忙生成。这是必要的代价。
4. **历史会话的 `provider_id` / `provider_name` 列残留** — 保留为 dead column，新会话不再写入。如果未来想做"按服务商筛选历史会话"的功能（不太可能），需要先做一次完整迁移。

## 未来方向

短期：稳定下来，观察 issue 趋势是否如预期变少；如果 1-2 周内"路由错乱"类 issue 归零，就把这次决策固化到产品定位里。

中期：如果 Anthropic 推出新的官方模型（比如 Claude 5），只需要更新 `src/lib/anthropic-models.ts` 的硬编码清单——一个 PR 的事。

长期：CodePilot 的差异化从"多 provider GUI"转向"Claude Code 的最佳桌面伴侣"——MCP 管理、Skills 市场、IM Bridge 远程控制、buddy 游戏化体验、Generative UI 看板——这些都是 CodePilot 独有、且不依赖 provider 子系统的能力。

## 参考

- [Anthropic Models 文档](https://docs.anthropic.com/en/docs/about-claude/models/overview) — 模型 ID 和能力对照
- [Claude Agent SDK settingSources 文档](https://docs.claude.com/en/api/agent-sdk/typescript) — `['user', 'project', 'local']` 的语义
- 相关 GitHub Issues：#26 / #30 / #302 / #305 / #427 / #430（早期"多 provider"诉求与后续配置错乱投诉）
- 用户受众分析中"多 Provider 高级用户 ~25%"的判断（[user-audience-analysis.md](./user-audience-analysis.md)）——这部分用户在新方案下仍然能用，只是配置入口从应用内 UI 转移到 `~/.claude/settings.json`
