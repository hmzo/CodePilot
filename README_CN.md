<img src="docs/icon-readme.png" width="32" height="32" alt="CodePilot" style="vertical-align: middle; margin-right: 8px;" /> CodePilot
===

**Claude Code 的桌面 GUI** -- 在 Claude Agent SDK 之上提供完整的桌面体验，凭据和模型直接读取 `~/.claude` 配置。通过 MCP、Skills 扩展能力，手机远程控制，让你的助理学会你的工作方式。

[![GitHub release](https://img.shields.io/github/v/release/op7418/CodePilot)](https://github.com/op7418/CodePilot/releases)
[![Downloads](https://img.shields.io/github/downloads/op7418/CodePilot/total)](https://github.com/op7418/CodePilot/releases)
[![GitHub stars](https://img.shields.io/github/stars/op7418/CodePilot)](https://github.com/op7418/CodePilot/stargazers)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/op7418/CodePilot/releases)
[![License](https://img.shields.io/badge/license-BSL--1.1-orange)](LICENSE)

[English](./README.md) | [日本語](./README_JA.md)

![CodePilot](https://github.com/user-attachments/assets/9750450a-9f6f-49ce-acd4-c623a4e24281)

---

[下载](#下载) | [快速开始](#快速开始) | [文档](#文档) | [贡献](#贡献) | [社区](#社区)

---

## 下载

| 平台 | 下载 | 架构 |
|---|---|---|
| macOS | [Apple Silicon (.dmg)](https://github.com/op7418/CodePilot/releases/latest) · [Intel (.dmg)](https://github.com/op7418/CodePilot/releases/latest) | arm64 / x64 |
| Windows | [安装包 (.exe)](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |
| Linux | [AppImage](https://github.com/op7418/CodePilot/releases/latest) · [.deb](https://github.com/op7418/CodePilot/releases/latest) · [.rpm](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |

或访问 [Releases](https://github.com/op7418/CodePilot/releases) 页面获取所有版本。

---

## 为什么选择 CodePilot

### 一份 `~/.claude` 配置走天下

CodePilot 不再自己维护服务商列表，所有凭据 / Base URL / 默认模型完全由 `~/.claude/settings.json`（或 `claude` 登录态）决定。模型选择器内置 Claude 官方 Sonnet / Opus / Haiku 通过 SDK `model` 选项传入；想用 OpenRouter、Volcengine、Bedrock 等转发服务，按 Anthropic 兼容协议配进 `~/.claude` 即可。

### 不只是写代码 — 全能 AI Agent

CodePilot 从编程工具起步，已成长为**通用 AI Agent 桌面客户端**：

- **Assistant Workspace** — 人设文件、持久记忆。你的助理会学习你的偏好并持续适应。
- **生成式 UI** — AI 可以创建交互式仪表盘、图表和可视化组件，在应用内实时渲染。
- **远程 Bridge** — 连接 Telegram、飞书、Discord、QQ 和微信。在手机上发消息，在桌面上收回复。
- **MCP + Skills** — 添加 MCP 服务器（stdio / sse / http），支持运行时监控。定义可复用技能或从 skills.sh 市场安装。
- **Media Studio** — AI 图片生成，支持批量任务、画廊和标签管理。

### 为日常使用而建

- 暂停、恢复和**回退会话到任意检查点**
- **分屏**并排运行两个对话
- 追踪 **Token 用量和费用**，附每日图表
- 直接读取 Claude Code CLI 会话历史
- 深色 / 浅色主题一键切换
- 中英文双语界面

---

## 快速开始

### 路径 A：下载发布版（大多数用户）

1. 安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview)：`npm install -g @anthropic-ai/claude-code`
2. 运行一次 `claude` 完成登录（或手动把 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 写进 `~/.claude/settings.json`）
3. 从上方[下载](#下载)区域下载对应平台的 CodePilot 安装包
4. 启动 CodePilot — 凭据会自动从 `~/.claude` 读取
5. 在对话框选择模型即可开始对话

### 路径 B：源码构建（开发者）

| 前置条件 | 最低版本 |
|---|---|
| Node.js | 18+ |
| npm | 9+（Node 18 自带） |

```bash
git clone https://github.com/op7418/CodePilot.git
cd CodePilot
npm install
npm run dev              # 浏览器模式，访问 http://localhost:3000
# -- 或者 --
npm run electron:dev     # 完整桌面应用
```

---

## 核心能力

### 对话与交互

| 能力 | 说明 |
|---|---|
| 交互模式 | Code / Plan / Ask |
| 推理力度 | Low / Medium / High / Max + Thinking 模式 |
| 权限控制 | Default / Full Access，逐项审批 |
| 会话控制 | 暂停、恢复、回退到检查点、归档 |
| 模型切换 | 对话中随时在 Claude Sonnet / Opus / Haiku 之间切换 |
| 分屏 | 并排双会话 |
| 附件 | 文件和图片，支持多模态视觉 |
| 斜杠命令 | /help /clear /cost /compact /doctor /review 等 |

### 扩展与集成

| 能力 | 说明 |
|---|---|
| 配置来源 | 直接读取 `~/.claude/settings.json` — 无需在应用内单独配置服务商 |
| MCP 服务器 | stdio / sse / http，运行时状态监控 |
| Skills | 自定义 / 项目 / 全局技能，skills.sh 市场 |
| Bridge | Telegram / 飞书 / Discord / QQ / 微信 远程控制 |
| CLI 集成 | 读取 Claude Code CLI .jsonl 会话历史 |
| 图片生成 | Gemini 生图、批量任务、画廊 |

### 数据与工作区

| 能力 | 说明 |
|---|---|
| Assistant Workspace | 人设文件（soul.md、user.md、claude.md、memory.md），持久记忆 |
| 生成式 UI | AI 创建的交互式仪表盘和可视化组件 |
| 文件浏览 | 项目文件树、语法高亮预览 |
| Git 面板 | 状态、分支、提交、Worktree 管理 |
| 用量分析 | Token 计数、费用估算、日用量图表 |
| 本地存储 | SQLite（WAL 模式），数据全部在本地 |
| 国际化 | 中文 + 英文 |
| 主题 | 深色 / 浅色，一键切换 |

---

## 首次使用

1. **确保 `~/.claude` 已配置** — 安装 Claude Code CLI（`npm install -g @anthropic-ai/claude-code`）后运行一次 `claude` 完成登录，或手动把 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 写进 `~/.claude/settings.json`。
2. **创建对话** — 选择工作目录、交互模式（Code / Plan / Ask），并在输入框中选择模型。
3. **设置 Assistant Workspace**（可选）— 前往 **设置 > Assistant**，选择工作区目录。CodePilot 会在工作区根目录创建 `soul.md`、`user.md`、`claude.md` 和 `memory.md`。
4. **添加 MCP 服务器**（可选）— 在侧边栏的 **MCP** 页面添加和管理 MCP 服务器。自定义技能在单独的 **Skills** 页面管理。

---

## 平台与安装说明

macOS 构建已使用 Developer ID 证书签名，但未进行公证（notarize），因此 Gatekeeper 在首次启动时仍可能弹出提示。Windows 和 Linux 构建未签名。

<details>
<summary>macOS：Gatekeeper 首次启动提示</summary>

**方案一** -- 在访达中右键 `CodePilot.app` > 打开 > 确认。

**方案二** -- 系统设置 > 隐私与安全性 > 滚动到安全性 > 点击「仍要打开」。

**方案三** -- 在终端运行：
```bash
xattr -cr /Applications/CodePilot.app
```
</details>

<details>
<summary>Windows：SmartScreen 阻止安装</summary>

**方案一** -- 在 SmartScreen 对话框中点击「更多信息」，然后点击「仍要运行」。

**方案二** -- 设置 > 应用 > 高级应用设置 > 将应用安装控制设为允许任何来源。
</details>

---

## 文档

📖 **完整文档：** [中文](https://www.codepilot.sh/zh/docs) | [English](https://www.codepilot.sh/docs)

**入门指南：**
- [快速开始](#快速开始) -- 下载或源码构建
- [首次使用](#首次使用) -- `~/.claude` 配置、工作区设置
- [安装指南](https://www.codepilot.sh/zh/docs/installation) -- 详细安装说明

**用户指南：**
- [MCP 服务器](https://www.codepilot.sh/zh/docs/mcp) -- 添加和管理 Model Context Protocol 服务器
- [Skills 技能](https://www.codepilot.sh/zh/docs/skills) -- 自定义技能、项目技能和 skills.sh 市场
- [Bridge 桥接](https://www.codepilot.sh/zh/docs/bridge) -- 通过 Telegram、飞书、Discord、QQ、微信远程控制
- [Assistant Workspace](https://www.codepilot.sh/zh/docs/assistant-workspace) -- 人设文件、记忆
- [常见问题](https://www.codepilot.sh/zh/docs/faq) -- 常见问题和解决方案

**开发文档：**
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- 架构、技术栈、目录结构、数据流
- [docs/handover/](./docs/handover/) -- 设计决策、交接文档
- [docs/exec-plans/](./docs/exec-plans/) -- 执行计划、技术债务

---

## 常见问题

<details>
<summary>必须安装 Claude Code CLI 吗？</summary>

需要。CodePilot 是 `claude` 的 GUI 外壳，凭据 / Base URL / 默认模型完全依赖 `~/.claude/settings.json`（或 `claude` 登录态）。在启动 CodePilot 之前请先 `npm install -g @anthropic-ai/claude-code` 并运行一次 `claude` 完成登录，或手动把 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 写进设置文件。
</details>

<details>
<summary>能用非 Anthropic 的服务商（OpenRouter、智谱等）吗？</summary>

可以 — 但要在 Claude Code 这一层配。把 `~/.claude/settings.json` 里的 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 指向你的网关（任意 Anthropic 兼容端点都行）。CodePilot 会跟着 SDK 一起读这份配置。
</details>

<details>
<summary><code>npm run dev</code> 和 <code>npm run electron:dev</code> 的区别</summary>

`npm run dev` 只启动 Next.js 开发服务器，在浏览器中访问 `http://localhost:3000` 使用 CodePilot。`npm run electron:dev` 同时启动 Next.js 和 Electron 外壳，提供完整的桌面应用体验，包含原生窗口控件。
</details>

<details>
<summary>Workspace 文件在哪里</summary>

设置工作区后，CodePilot 在**工作区根目录**创建四个 Markdown 文件：`soul.md`（人设）、`user.md`（用户档案）、`claude.md`（规则）、`memory.md`（长期笔记）。状态跟踪（Onboarding 进度、签到日期）保存在 `.assistant/` 子目录中。每日记忆保存在 `memory/daily/` 中。
</details>

<details>
<summary>Bridge 需要额外的平台配置</summary>

每个 Bridge 通道（Telegram、飞书、Discord、QQ、微信）都需要各自的 Bot Token 或应用凭证。在侧边栏的 **Bridge** 页面配置通道。你需要先在目标平台创建 Bot 并获取 Token，然后提供给 CodePilot。
</details>

---

## 社区

<img src="docs/wechat-group-qr.png" width="240" alt="微信用户群二维码" />

扫描二维码加入微信用户群，交流使用心得、反馈问题和获取最新动态。

- [GitHub Issues](https://github.com/op7418/CodePilot/issues) -- Bug 反馈和功能建议
- [GitHub Discussions](https://github.com/op7418/CodePilot/discussions) -- 提问和讨论

---

## 贡献

1. Fork 本仓库并创建功能分支
2. `npm install` 然后 `npm run electron:dev` 本地开发
3. 提交 PR 前运行 `npm run test`
4. 向 `main` 提交 PR，附上清晰的变更说明

请保持 PR 聚焦 -- 每个 PR 只包含一个功能或修复。

<details>
<summary>开发命令</summary>

```bash
npm run dev                    # Next.js 开发服务器（浏览器）
npm run electron:dev           # 完整 Electron 应用（开发模式）
npm run build                  # 生产构建
npm run electron:build         # 构建 Electron 可分发包
npm run electron:pack:mac      # macOS DMG（arm64 + x64）
npm run electron:pack:win      # Windows NSIS 安装包
npm run electron:pack:linux    # Linux AppImage、deb、rpm
```

**CI/CD：** 推送 `v*` tag 会自动触发全平台构建并创建 GitHub Release。

**说明：**
- Electron 在 `127.0.0.1` 上 fork Next.js standalone 服务器，使用随机可用端口
- 聊天数据存储在 `~/.codepilot/codepilot.db`（开发模式：`./data/`）
- SQLite 使用 WAL 模式，并发读取性能优秀
</details>

---

## 许可证

[Business Source License 1.1 (BSL-1.1)](LICENSE)

- **个人 / 学术 / 非营利用途**：免费且无限制
- **商业用途**：需要单独许可 — 联系 [@op7418 on X](https://x.com/op7418)
- **变更日期**：2029-03-16 — 届时代码转为 Apache 2.0
