# 首次引导 Setup Center + Claude Code 环境检测

> 完成时间：2026-03-13 | 2026-04-25 调整：provider 配置链路下线
> 产品思考见 [docs/insights/remove-provider.md](../insights/remove-provider.md)
> 关联：[docs/exec-plans/active/remove-provider-system.md](../exec-plans/active/remove-provider-system.md)

## 概述

CodePilot 的首次设置引导（Setup Center），用于替代被动的"失败后提示"模式。当前覆盖两个核心前置条件：Claude Code CLI 连接、默认项目目录。引导可跳过，但 `/chat` 页发消息前仍会做独立校验。

> **历史变更**：早期版本还有"API Provider 配置"卡片（`ProviderCard`），用于检测 `api_providers` 表 + `ANTHROPIC_API_KEY` 等凭据。2026-04-25 provider 子系统整体下线后，引导只保留 CLI 检测和目录选择，凭据完全交给 `~/.claude/settings.json` 与 `claude` CLI 登录态。

## 架构

### 整体流程

```
应用启动
  ↓
AppShell.useEffect → GET /api/setup
  ↓
setup_completed !== true?
  ├── 是 → 弹出 SetupCenter 蒙层
  │         ├── ClaudeCodeCard: 检测 CLI 环境 + 冲突
  │         └── ProjectDirCard: 选择默认项目目录
  │         用户可逐个完成或跳过，全部完成后自动关闭
  └── 否 → 正常进入应用
              ↓
         /chat 页独立校验 ~/.claude 凭据 + 目录
         缺失时显示 ChatEmptyState 引导
```

### 组件结构

```
AppShell
  └── SetupCenter (fixed overlay, z-50)
        ├── WelcomeCard (静态)
        ├── ClaudeCodeCard → /api/claude-status
        └── ProjectDirCard → /api/setup/recent-projects
```

### 状态持久化

Setup 状态存储在 SQLite settings 表：

| 键 | 值 | 说明 |
|---|---|---|
| `setup_completed` | `'true'` | 整体完成标记，控制是否自动弹出 |
| `setup_claude_skipped` | `'true'` | 用户跳过了 Claude Code 检测 |
| `setup_project_skipped` | `'true'` | 用户跳过了项目目录选择 |
| `setup_default_project` | 路径字符串 | 用户选择的默认项目目录 |

> ~~`setup_provider_skipped`~~：随 provider 子系统下线一并删除（`db.ts` 迁移会清理历史值）。

### 重新打开

- 设置页 GeneralSection 中有"首次设置引导"入口
- 代码中任何位置可通过 `window.dispatchEvent(new CustomEvent('open-setup-center'))` 触发
- 支持 `initialCard` 参数跳转到指定卡片：`{ detail: { initialCard: 'claude' } }` 或 `'project'`

### 自动关闭逻辑

- 用 `initialCompletedCountRef` 记录打开时的已完成数
- 只在用户**当前会话中**完成了最后一张卡时才自动关闭
- 已全部完成的状态下手动打开不会自动关（避免从设置页点开瞬间关闭）

## Claude Code 环境检测（详细）

### 检测链路

```
ClaudeCodeCard
  ↓ GET /api/claude-status
  ↓
findClaudeBinary() + findAllClaudeBinaries()  (src/lib/platform.ts)
  ↓
返回:
  connected: boolean        — 是否找到可用二进制
  version: string | null    — 版本号
  binaryPath: string | null — 当前使用的路径
  installType: string       — native / npm / bun / homebrew / unknown
  otherInstalls: Array<{path, version, type}>  — 其他冲突安装
  missingGit: boolean       — Windows 上未检测到 Git
```

### 四种状态及 UI 展示

#### 1. 已检测到（connected = true, 无冲突）
- 绿色 completed 状态
- 显示版本号、安装类型、二进制路径

#### 2. 已检测到但存在冲突（connected = true, otherInstalls.length > 0）
- 黄色警告框，标题："检测到多个安装版本，可能导致版本冲突"
- 显示当前使用的版本（路径 + 安装类型 + 版本号）
- "查看清理方式"按钮 → 展开详情：
  - 逐条列出每个冲突安装的路径、类型、版本
  - 根据安装类型给出卸载命令（带一键复制按钮）：
    - npm: `npm uninstall -g @anthropic-ai/claude-code`
    - bun: `bun remove -g @anthropic-ai/claude-code`
    - homebrew: `brew uninstall --cask claude-code`
  - 底部提示"清理完成后，点击重新检测以确认" + Re-detect 按钮

#### 3. 未找到（connected = false, missingGit = false）
- 显示安装命令：
  - macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`
  - Windows: `irm https://claude.ai/install.ps1 | iex`
- Re-detect 按钮

#### 4. 缺少 Git（Windows 专用, missingGit = true）
- 显示 Git for Windows 安装步骤（三步引导）
- Re-detect 按钮

### 冲突处理的设计决策

- **不自动切换**：冲突状态下仍标记为 completed（能正常工作），只给出警告和清理建议
- **复用 InstallWizard 的卸载逻辑**：`getUninstallCommand()` 与 InstallWizard 的 `getUninstallAdvice()` 保持一致
- **CopyableCommand 组件**：卸载命令支持一键复制，降低操作门槛

## 凭据检测（已下线）

> 旧版的 `ProviderCard` 会检测 `api_providers` 表、`ANTHROPIC_API_KEY` env、`anthropic_auth_token` setting 三条凭据来源。
> 现在 CodePilot 不再读这些来源，凭据完全由 Claude Agent SDK 通过 `settingSources: ['user', 'project', 'local']` 直接从 `~/.claude/settings.json` 与 `claude` CLI 登录态读取。
> `/chat` 页若想做"发消息前提示用户去登录"，应该改为检测 `~/.claude/.credentials.json` 是否存在，而不是查 DB。

## 项目目录

### 目录回退链

```
page.tsx 初始化 workingDir:
  1. localStorage['codepilot:last-working-directory']
     ↓ 校验 /api/files/browse → 有效则使用
     ↓ 无效 → 清除 localStorage
  2. GET /api/setup → defaultProject
     ↓ 校验 /api/files/browse → 有效则使用并写入 localStorage
  3. 都无效 → 显示空状态（ChatEmptyState）
```

ChatListPanel 的 `handleNewChat` 使用相同的回退链：最近目录 → defaultProject → 弹 picker。

### 跨组件同步

- ProjectDirCard 选中目录后，通过 `project-directory-changed` CustomEvent 通知 /chat 页
- /chat 页监听该事件，实时更新 `workingDir` 状态
- 同时写入 `localStorage` 和 `/api/setup`（server 端持久化）

## Toast 系统

### 架构

- `useToast.ts`：全局状态 + `showToast()` 命令式 API
- `toast.tsx`：`<Toaster />` 组件，渲染在 AppShell 底层
- FIFO 策略，最多 3 条，默认 5s 消失（error 8s）
- 支持 `action: { label, onClick }` 可选操作按钮

### 使用场景

| 场景 | 类型 | 位置 |
|---|---|---|
| Push 成功/失败 | success/error | GitStatusSection |
| 标题保存失败 | error | UnifiedTopBar |
| 目录失效 | warning + action | ChatListPanel |

## Windows 适配

- UnifiedTopBar 右侧添加 138px spacer（3 × 46px 系统标题按钮宽度），通过 `useClientPlatform().isWindows` 判断
- 路径分割统一使用 `split(/[\\/]/).filter(Boolean)` 兼容反斜杠
- ProjectGroupHeader 的"在文件管理器中打开"文案根据平台动态切换（Finder / Explorer / Files）

## 文件清单

### 现存文件

| 文件 | 用途 |
|---|---|
| `src/hooks/useClientPlatform.ts` | SSR 安全的平台检测 hook |
| `src/hooks/useToast.ts` | Toast 状态管理 + 全局 API |
| `src/components/ui/toast.tsx` | Toaster 渲染组件 |
| `src/components/ui/error-banner.tsx` | 内联错误条 |
| `src/app/api/setup/route.ts` | Setup 状态 CRUD |
| `src/app/api/setup/recent-projects/route.ts` | 最近项目列表 |
| `src/components/setup/SetupCenter.tsx` | 引导蒙层主组件 |
| `src/components/setup/SetupCard.tsx` | 可复用卡片壳 |
| `src/components/setup/WelcomeCard.tsx` | 欢迎卡片 |
| `src/components/setup/ClaudeCodeCard.tsx` | Claude Code 检测 + 冲突处理 |
| `src/components/setup/ProjectDirCard.tsx` | 项目目录选择 |
| `src/components/chat/ChatEmptyState.tsx` | /chat 空状态引导 |

### 已删除文件（2026-04-25）

| 文件 | 删除理由 |
|---|---|
| `src/components/setup/ProviderCard.tsx` | provider 子系统整体下线 |

## 已知限制

- Setup Center 不是分步向导，而是所有卡片同时展示在滚动面板中
- Claude Code 冲突检测依赖 `findAllClaudeBinaries()` 的路径扫描，可能遗漏非标准安装路径
- 没有"在 Setup Center 内检测 `~/.claude` 凭据"的卡片：用户首次启动并不知道是否需要先 `claude` 登录；目前只能在 `/chat` 页发消息后看到错误。后续如果要补回这个体验，可以新增一张轻量"Login to Claude"卡，调用 IPC 让用户跳到外部终端跑 `claude`
- 目录校验使用 `/api/files/browse` 接口，额外产生一次文件系统访问
