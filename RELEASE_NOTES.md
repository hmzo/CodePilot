## CodePilot v0.49.0

> 内置 Claude Code 原生二进制：不再依赖 Node.js，下载安装包就能直接聊。

### 新增功能

- **内置 Claude Code**：CodePilot 安装包现在直接捆绑 Claude Code v2.1.119 原生二进制（macOS arm64/x64、Windows x64），无需提前安装 Node.js、`npm install -g @anthropic-ai/claude-code` 或 `curl claude.ai/install.sh`，下载即用
- 用户机器上其他渠道安装的 `claude`（npm/Bun/Homebrew/winget 等）会在设置页做信息展示，CodePilot 始终使用内置版本，避免版本错乱
- 启动时把内置 claude 目录前置到子进程的 PATH，所有 SDK 工具调用都能找到正确版本

### 修复问题

- 修复在没有 Node.js 的干净系统上 CodePilot 启动后无法发送消息的问题（根因：旧版本依赖用户预装 Claude Code CLI）

### 优化改进

- Connection Status 状态胶囊改为「内置 vX.Y.Z」直接展示，去掉「请安装/请升级」流程
- 删除应用内的 Claude Code 安装向导和后台升级流程（约 400+ 行 IPC + UI 代码）
- macOS 构建中 `Contents/Resources/claude/claude` 跟随主应用一起用 Developer ID 重签 + hardened runtime，`codesign --verify --deep --strict` 通过
- 安装包体积每个架构增加约 200MB（DMG 从 ~150MB 增加到 ~350MB），换来零依赖、离线可用

### 已知影响

- 单平台 DMG/EXE 文件体积约翻倍，下载耗时更长
- 内置 Claude Code 版本随 CodePilot 一起发版升级，不再支持后台静默升级；如果想跑更新版本，请等待下一次 CodePilot 发版
- Windows 仍需手动安装 Git for Windows 才能让 Claude Code 的 shell 工具调用正常工作（应用内提供一键安装）

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.49.0/CodePilot-0.49.0-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.49.0/CodePilot-0.49.0-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.49.0/CodePilot.Setup.0.49.0.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装；首次使用前请确保已安装 Git for Windows（应用内会引导）

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 Anthropic 凭据（`~/.claude/settings.json` 或 `claude` 登录态）
- **不再需要预装 Node.js 或 Claude Code CLI**

---

## CodePilot v0.48.0

> 修复使用 VPN/代理工具时飞书桥接无法连接的问题，关闭自动更新检查。

### 修复问题

- 修复使用 V2Ray、Clash 等代理工具时飞书桥接始终报"app not online"无法连接的问题：代理工具设置的系统环境变量导致飞书 SDK 的 HTTPS 请求通过代理发送时 TLS 握手失败，现在飞书相关请求会自动绕过系统代理直连

### 优化改进

- 关闭启动时和定时自动检查更新，避免每次打开应用时访问外部接口；手动检查更新仍可在设置中触发

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/hmzo/CodePilot/releases/download/v0.48.0/CodePilot-0.48.0-arm64.dmg)
- [Intel](https://github.com/hmzo/CodePilot/releases/download/v0.48.0/CodePilot-0.48.0-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/hmzo/CodePilot/releases/download/v0.48.0/CodePilot.Setup.0.48.0.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter 等）
- 推荐安装 Claude Code CLI 以获得完整功能

---

## CodePilot v0.47.0

> 服务商系统全面治理，新增连接测试和匿名错误上报，品牌重定位为多模型 AI Agent 桌面客户端。

### 新增功能

- 服务商配置新增"测试连接"按钮：填完 API Key 后立即验证是否能连通，不用发消息才发现配置有误
- 服务商配置新增引导面板：显示计费模式标签、API Key 获取链接、配置注意事项
- 新增匿名错误上报（Sentry）：帮助开发者定位高频问题，默认开启，可在设置中关闭
- 新增服务商模型管理 API：支持为每个服务商自定义添加/删除模型
- 新增小米 MiMo 服务商（按量付费 + Token Plan 两种模式）

### 修复问题

- 修复智谱 GLM、Moonshot、OpenRouter、百炼等 6 个服务商的认证方式配置错误，大幅减少首次连接失败
- 修复用户终端 Claude Code 的 settings.json 配置覆盖 CodePilot 服务商选择的问题
- 修复运行时报错缺少恢复操作建议的问题，现在会显示"重新获取 Key"等可点击链接
- 修复模型选择下拉框出现横向滚动条的问题
- 修复"管理服务商"按钮跳转到通用设置而非服务商页面的问题
- 修复 Kimi 使用了错误的认证头（Bearer 而非 X-Api-Key）的问题

### 优化改进

- 品牌重定位：从"Claude Code 桌面 GUI"更新为"多模型 AI Agent 桌面客户端"
- README 全面重构（中/英/日三语）：新增下载量和 Stars badges，下载区前置，17+ 服务商表格
- 服务商系统新增 Zod Schema 校验：防止无效配置上线，新增 61 个自动化测试
- 服务商配置页去除 230 行重复代码，统一为单一数据源
- 官网服务商文档更新：修正国内服务商表格，新增各服务商注意事项
- GitHub About 描述和联系方式更新

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.47.0/CodePilot-0.47.0-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.47.0/CodePilot-0.47.0-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.47.0/CodePilot.Setup.0.47.0.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter / 智谱 / Kimi / Ollama 等）
- 推荐安装 Claude Code CLI 以获得完整功能
