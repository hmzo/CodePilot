# 内置 Claude Code 产品思考

> 技术实现见 [docs/handover/bundled-claude-code.md](../handover/bundled-claude-code.md)

## 解决的用户问题

CodePilot 此前依赖用户在自己机器上预装 Claude Code CLI，新用户的体验是：

1. 下载 CodePilot DMG，拖入 Applications，启动
2. 弹出 Install Wizard 提示"未检测到 Claude Code"，给出选项：
   - 自动跑 `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows 用户额外要装 Git for Windows + 跑 PowerShell 脚本
3. 安装失败时还要看日志、复制粘贴、找官方文档

**痛点**：

- **零基础用户被卡死**：一个想用 CodePilot 当 Claude Code GUI 的设计师/产品经理，看到"先装 Node.js 才能用"直接放弃
- **多版本冲突**：用户机器上同时装了 npm / Bun / Homebrew / native installer 的 claude，CodePilot 选错或选到旧版，行为飘忽
- **企业环境**：内网机器无法访问 `claude.ai/install.sh`，公司禁用了 npm global install
- **支持负担**：每次发版都要在 README/onboarding 里维护 3-4 套不同平台的安装文档；issue 里至少一半是"装不上"
- **离线场景**：网络受限的展会演示 / 飞机上 / VPN 故障时打不开 Claude Code

打包内置之后这些问题一次性消失：双击 DMG → 拖到 Applications → 立刻能用。

## 为什么这样设计而不是其他方案

### 备选 1：保持外部依赖，改善 onboarding

- 优势：包体小，更新及时
- 劣势：根本痛点（用户不会装 Node.js / 不会跑 shell 命令）没解决；issue 数量不会下降

### 备选 2：内置 + 用户版优先（混合解析）

- 优势：用户能保留自己的 Claude Code 版本（比如他想测最新 beta）
- 劣势：
  - **可重现性差**：bug repro 取决于用户机器装的版本，CodePilot 测过的版本反而用不上
  - **测试矩阵爆炸**：要测 N 种 Claude Code 版本 × M 种 CodePilot 版本
  - **静默版本错位**：用户的 Claude Code 老到不支持新 SDK schema 时报"内部错误"
  - **挨骂场景明确**：用户跑了 `claude update` 升到带 bug 的版本，CodePilot 跟着出问题但代码没改过

### 备选 3：保留 Install Wizard，但默认走内置

- 跟备选 2 等价，只是 UI 路径换了，问题一样

### 选择：完整内置 + 永远用内置

- **简单**：一条 happy path，没有 if-else
- **可控**：CodePilot v1.0 测过的 Claude Code 在 v1.1 还是同一个，行为不漂移
- **零外部依赖**：连 Node.js 都不用
- **代价**：DMG 从 150 MB → 360 MB，可接受（多数现代桌面应用同等量级；Slack / Discord / Notion 都在 200~500 MB 区间）

### 备选 4：内置但允许通过设置切换"使用系统版"

- 留作未来 escape hatch，但 v0.48 不实现 — 收到真实需求再加

## 用户反馈驱动的决策

- 早期 issue 反复出现 "wizard 跑了一半失败 / SignTool error / npm permission denied"（约 30+ 起）
- 论坛用户问"能不能像 LM Studio / Ollama 一样下载就能用"
- 内部 dogfooding 时，从 0 状态新机器到能聊天平均要 5-10 分钟，全是装 Claude Code 的步骤
- 飞书用户群里多次提到"Mac mini 给同事用，结果他机器上 claude 是 1.x 的，跑不起来"

## 参考的外部产品 / 趋势

- **LM Studio**：完整下载即用，模型、推理引擎全打包，是当代桌面 AI 应用的标杆 onboarding
- **Ollama**：bin 直接 ship，但要 `ollama pull`；CodePilot 选择更激进（连 pull 步骤都省）
- **Discord / Slack / 1Password**：electron app 内嵌大型 native 子组件已有先例，包体 200~500 MB 是公认可接受
- **Tauri 趋势**：bundle tauri sidecar 是社区主流模式之一，本方案本质相同

## 已知局限性

### 包体翻倍

- 单 DMG ~360 MB（之前 ~150 MB），全平台累计上传到 GitHub Release 约 1.5 GB 一个版本
- GitHub Release 单文件上限 2 GB 内尚宽松；CDN / IPFS 镜像如有需要可后续追加
- macOS 用户初次下载多花 1-2 分钟，但后续启动毫秒级（无网络依赖）

### Claude Code 版本滞后

- 用户拿到的版本永远是 CodePilot 发版时锁定的版本
- Anthropic 发关键修复时需要 CodePilot 同步发 patch release（流程要保证 < 24h 响应）
- RELEASE_NOTES 中明确列出每版本捆绑的 Claude Code 版本号
- 长期看可考虑加"内置版本旁路开关"，让进阶用户用自己的 `claude`（备选 4）

### macOS 签名复杂度上升

- Anthropic 已签的 binary 被 outer `--deep` sign 时会被打散，需要在 after-sign hook 里**显式重签**
- 已通过 [scripts/after-sign.js](../../scripts/after-sign.js) 解决，但日后维护时要记得 binary 签名 always 跟着 outer .app identity

### 平台覆盖

- 当前 fetcher 支持 darwin / win32 / linux × x64 / arm64（共 6 种）
- musl Linux 通过 `CODEPILOT_CLAUDE_LIBC=musl` 环境变量切换；CI 默认 glibc
- 32 位 Linux / FreeBSD / Solaris 等小众平台暂不覆盖（用户极少）

## 未来方向

### 短期（1-2 个迭代）

- 把"已内置 Claude Code v2.1.119"在 About 对话框里显示出来
- Setup Center 的 Claude Code 卡片永远显示 ✓，但加可折叠的 "advanced — 我的机器上还有这些 claude" 信息区

### 中期

- "应急通道"：Settings 里加 toggle "use system claude instead"，给开发 Anthropic SDK 的高阶用户用
- bundled binary 完整性检查（启动时 SHA256，对不上就提示重装）

### 长期

- bundled-binary 分离更新通道：Anthropic 发 hotfix 时不强制 CodePilot 同步发版
  - 类似 Electron 的 `electron-updater` 把 Claude Code differential update 拆出来
  - 风险：复杂度高，会引入版本错位

## 设计哲学

**"Just Works on Day 1"** 比任何小聪明都重要。

- 用户第一次打开 app，看不到任何 install 提示、不需要 sudo、不需要终端、不需要 npm，就能用
- 包体增加 200 MB 换"零摩擦 onboarding"是非常划算的交易
- 高阶用户的小众诉求（用自己的 claude 版本）通过未来的 escape hatch 解决，不为他们牺牲普通用户体验

CodePilot 的产品定位是"非技术用户也能用的 Claude Code 桌面客户端"，内置 Claude Code 是这个定位的最大兑现 — 把所有"先装 X 才能用 Y"的步骤压缩到下载安装这一步。
