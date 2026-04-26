# 产品思考文档

记录功能设计背后的"为什么"——用户问题、设计理由、外部趋势、已知局限和未来方向。

每份文档对应一个 `docs/handover/` 中的技术交接文档，文件名保持一致，互相反向链接。

## 索引

| 文档 | 对应交接文档 | 主题 |
|------|------------|------|
| [cli-tools.md](./cli-tools.md) | [handover/cli-tools.md](../handover/cli-tools.md) | CLI 工具管理的 MCP 化、Agent-first CLI 趋势、凭证管理痛点 |
| [dashboard-generative-ui.md](./dashboard-generative-ui.md) | [handover/dashboard.md](../handover/dashboard.md) | 生成式 UI 持久化、AI-first 项目看板、系统级渲染层构想、实现后复盘 |
| [context-management.md](./context-management.md) | [handover/context-management.md](../handover/context-management.md) | 上下文管理：长对话失忆/PTL 问题、分级压缩策略、Claude Code 参考与取舍、Codex 审计驱动的优先级 |
| [cli-upgrade-proxy.md](./cli-upgrade-proxy.md) | [handover/cli-upgrade-proxy.md](../handover/cli-upgrade-proxy.md) | CLI 升级 + 代理透传：P0 版本问题、分渠道升级策略、系统代理无感透传、Git 依赖引导 |
| [tool-call-ux.md](./tool-call-ux.md) | [handover/tool-call-ux.md](../handover/tool-call-ux.md) | 工具调用 UX：thinking 展示设计决策、注册表 vs if/else、归组阈值、缓冲旁路、竞品对比 |
| [performance-memory.md](./performance-memory.md) | [handover/performance-memory.md](../handover/performance-memory.md) | 内存优化：LRU vs 定期清理、300 条上限 + reconciliation、定时器泄漏、大文件流式读取 |
| [user-audience-analysis.md](./user-audience-analysis.md) | — | 用户受众分析：画像、需求优先级、竞品格局、品牌定位路线取舍（2026-04-04 数据快照；原对应 handover/provider-architecture.md 已随 provider 子系统下线删除） |
| [remove-provider.md](./remove-provider.md) | [handover/onboarding-setup-center.md](../handover/onboarding-setup-center.md) / [handover/bridge-system.md](../handover/bridge-system.md) / [handover/context-management.md](../handover/context-management.md) | 移除 Provider 子系统：为什么把 CodePilot 退化为 Claude Code GUI 客户端、模型选择器/Bridge/辅助 AI 功能取舍、对升级用户与新用户的影响 |
| [bundled-claude-code.md](./bundled-claude-code.md) | [handover/bundled-claude-code.md](../handover/bundled-claude-code.md) | 内置 Claude Code：解决"零基础用户装不上 Node.js"痛点、为什么完整内置而非混合解析、包体 vs onboarding 摩擦的取舍、未来 escape hatch 方向 |
