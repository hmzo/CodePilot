<img src="docs/icon-readme.png" width="32" height="32" alt="CodePilot" style="vertical-align: middle; margin-right: 8px;" /> CodePilot
===

**A desktop GUI for Claude Code** -- ships with Claude Code built in (no Node.js or separate install required), runs on top of your existing `~/.claude` configuration, extends with MCP & skills, controls from your phone, and lets your assistant learn your workflow.

[![GitHub release](https://img.shields.io/github/v/release/op7418/CodePilot)](https://github.com/op7418/CodePilot/releases)
[![Downloads](https://img.shields.io/github/downloads/op7418/CodePilot/total)](https://github.com/op7418/CodePilot/releases)
[![GitHub stars](https://img.shields.io/github/stars/op7418/CodePilot)](https://github.com/op7418/CodePilot/stargazers)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/op7418/CodePilot/releases)
[![License](https://img.shields.io/badge/license-BSL--1.1-orange)](LICENSE)

[中文文档](./README_CN.md) | [日本語](./README_JA.md)

![CodePilot](https://github.com/user-attachments/assets/9750450a-9f6f-49ce-acd4-c623a4e24281)

---

[Download](#download) | [Quick Start](#quick-start) | [Documentation](#documentation) | [Contributing](#contributing) | [Community](#community)

---

## Download

| Platform | Download | Architecture |
|---|---|---|
| macOS | [Apple Silicon (.dmg)](https://github.com/op7418/CodePilot/releases/latest) · [Intel (.dmg)](https://github.com/op7418/CodePilot/releases/latest) | arm64 / x64 |
| Windows | [Installer (.exe)](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |
| Linux | [AppImage](https://github.com/op7418/CodePilot/releases/latest) · [.deb](https://github.com/op7418/CodePilot/releases/latest) · [.rpm](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |

Or visit the [Releases](https://github.com/op7418/CodePilot/releases) page for all versions.

---

## Why CodePilot

### A desktop GUI for `claude`

CodePilot is a Claude Code companion. All credentials, base URLs, and default models come from your existing `~/.claude/settings.json` (or your `claude` login session). Configure once via the Claude Code CLI, and CodePilot picks it up automatically — no separate provider setup inside the app.

The model selector lets you switch between official Anthropic models (Sonnet / Opus / Haiku) mid-conversation; everything else is delegated to your local Claude Code config.

### Beyond coding — a full AI agent

CodePilot started as a coding tool but has grown into a **general-purpose AI agent desktop**:

- **Assistant Workspace** — Persona files, persistent memory, and progressive onboarding driven entirely by Claude. Your assistant learns your preferences and adapts over time.
- **Generative UI** — AI can create interactive dashboards, charts, and visual widgets rendered live in-app.
- **Remote Bridge** — Connect to Telegram, Feishu, Discord, QQ, and WeChat. Send messages from your phone, get responses on your desktop.
- **MCP + Skills** — Add MCP servers (stdio / sse / http) with runtime monitoring. Define reusable skills or install from the skills.sh marketplace.
- **Media Studio** — AI image generation with batch tasks, gallery, and tagging.

### Built for daily use

- Pause, resume, and **rewind sessions to any checkpoint**
- **Split-screen** dual sessions side by side
- Track **token usage and costs** with daily charts
- Reads your existing Claude Code CLI session history
- Dark / Light theme toggle
- English + Chinese interface

---

## Quick Start

### Path A: Download a release (most users)

1. Download the CodePilot installer for your platform from the [Download](#download) section above
2. Launch CodePilot — Claude Code is bundled inside the installer, no Node.js required
3. Sign in with your Anthropic account (or write `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` into `~/.claude/settings.json` manually)
4. Pick a model in the chat composer and start a conversation

### Path B: Build from source (developers)

| Prerequisite | Minimum version |
|---|---|
| Node.js | 18+ |
| npm | 9+ (ships with Node 18) |

```bash
git clone https://github.com/op7418/CodePilot.git
cd CodePilot
npm install
npm run dev              # browser mode at http://localhost:3000
# -- or --
npm run electron:dev     # full desktop app
```

---

## Core Capabilities

### Conversation & Interaction

| Capability | Details |
|---|---|
| Interaction modes | Code / Plan / Ask |
| Reasoning effort | Low / Medium / High / Max + Thinking mode |
| Permission control | Default / Full Access, per-action approval |
| Session control | Pause, resume, rewind to checkpoint, archive |
| Model switching | Switch between Claude Sonnet / Opus / Haiku mid-conversation |
| Split screen | Side-by-side dual sessions |
| Attachments | Files and images with multimodal vision support |
| Slash commands | /help /clear /cost /compact /doctor /review and more |

### Extensions & Integrations

| Capability | Details |
|---|---|
| Configuration | Reads `~/.claude/settings.json` directly — no separate provider setup |
| MCP servers | stdio / sse / http, runtime status monitoring |
| Skills | Custom / project / global skills, skills.sh marketplace |
| Bridge | Telegram / Feishu / Discord / QQ / WeChat remote control |
| CLI integration | Reads Claude Code CLI .jsonl session history |
| Image generation | Gemini image gen, batch tasks, gallery |

### Data & Workspace

| Capability | Details |
|---|---|
| Assistant Workspace | Persona files (soul.md, user.md, claude.md, memory.md), persistent memory |
| Generative UI | AI-created interactive dashboards and visual widgets |
| File browser | Project file tree with syntax-highlighted preview |
| Git panel | Status, branches, commits, worktree management |
| Usage analytics | Token counts, cost estimates, daily usage charts |
| Local storage | SQLite (WAL mode), all data stays on your machine |
| i18n | English + Chinese |
| Themes | Dark / Light, one-click toggle |

---

## First Launch

1. **Configure `~/.claude`** — Sign in to your Anthropic account from inside CodePilot (Claude Code is already bundled), or write `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` into `~/.claude/settings.json` manually before launch.
2. **Create a conversation** — Pick a working directory, select a mode (Code / Plan / Ask), and pick a model in the composer.
3. **Set up Assistant Workspace** (optional) — Go to **Settings > Assistant**, choose a workspace directory. CodePilot creates `soul.md`, `user.md`, `claude.md`, and `memory.md` at the workspace root.
4. **Add MCP servers** (optional) — Go to the **MCP** page in the sidebar to add and manage MCP servers. Custom skills are managed on the separate **Skills** page.

---

## Platform & Installation Notes

macOS builds are code-signed with a Developer ID certificate but not notarized, so Gatekeeper may still prompt on first launch. Windows and Linux builds are unsigned.

<details>
<summary>macOS: Gatekeeper warning on first launch</summary>

**Option 1** -- Right-click `CodePilot.app` in Finder > Open > confirm.

**Option 2** -- System Settings > Privacy & Security > scroll to Security > click Open Anyway.

**Option 3** -- Run in Terminal:
```bash
xattr -cr /Applications/CodePilot.app
```
</details>

<details>
<summary>Windows: SmartScreen blocks the installer</summary>

**Option 1** -- Click "More info" on the SmartScreen dialog, then "Run anyway".

**Option 2** -- Settings > Apps > Advanced app settings > set App Install Control to allow apps from anywhere.
</details>

---

## Documentation

📖 **Full documentation:** [English](https://www.codepilot.sh/docs) | [中文](https://www.codepilot.sh/zh/docs)

**Getting started:**
- [Quick Start](#quick-start) -- Download or build from source
- [First Launch](#first-launch) -- Claude Code CLI check, workspace configuration
- [Installation Guide](https://www.codepilot.sh/docs/installation) -- Detailed setup instructions

**User guides:**
- [MCP Servers](https://www.codepilot.sh/docs/mcp) -- Adding and managing Model Context Protocol servers
- [Skills](https://www.codepilot.sh/docs/skills) -- Custom skills, project skills, and the skills.sh marketplace
- [Bridge](https://www.codepilot.sh/docs/bridge) -- Remote control via Telegram, Feishu, Discord, QQ, WeChat
- [Assistant Workspace](https://www.codepilot.sh/docs/assistant-workspace) -- Persona files, memory
- [FAQ](https://www.codepilot.sh/docs/faq) -- Common issues and solutions

**Developer docs:**
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- Architecture, tech stack, directory structure, data flow
- [docs/handover/](./docs/handover/) -- Design decisions and handover documents
- [docs/exec-plans/](./docs/exec-plans/) -- Execution plans and tech debt tracker

---

## FAQ

<details>
<summary>Do I need to install the Claude Code CLI separately?</summary>

No. CodePilot ships with the official Claude Code native binary inside the installer, so you don't need Node.js, npm, Bun, or `curl claude.ai/install.sh`. The bundled binary is always used at runtime; user-installed copies on your machine (if any) are listed informationally but not invoked. You still need to sign in with an Anthropic account or populate `~/.claude/settings.json` so CodePilot has credentials.
</details>

<details>
<summary>Can I use a non-Anthropic provider (OpenRouter, Zhipu, etc.)?</summary>

Yes — but configure it through Claude Code itself. Set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` in `~/.claude/settings.json` to point at your gateway (any Anthropic-compatible endpoint works). CodePilot just defers to whatever the SDK reads from there.
</details>

<details>
<summary>What is the difference between <code>npm run dev</code> and <code>npm run electron:dev</code>?</summary>

`npm run dev` starts only the Next.js dev server -- you use CodePilot in your browser at `http://localhost:3000`. `npm run electron:dev` starts both Next.js and the Electron shell, giving you the full desktop app experience with native window controls.
</details>

<details>
<summary>Where are the Assistant Workspace files?</summary>

When you set up a workspace, CodePilot creates four Markdown files at the **workspace root directory**: `soul.md` (personality), `user.md` (user profile), `claude.md` (rules), and `memory.md` (long-term notes). State tracking (onboarding progress, check-in dates) is stored in the `.assistant/` subdirectory. Daily memories go to `memory/daily/`.
</details>

<details>
<summary>Bridge requires additional setup per platform</summary>

Each Bridge channel (Telegram, Feishu, Discord, QQ, WeChat) requires its own bot token or app credentials. Go to the **Bridge** page in the sidebar to configure channels. You will need to create a bot on the target platform first and provide the token to CodePilot.
</details>

---

## Community

<img src="docs/wechat-group-qr.png" width="240" alt="WeChat Group QR Code" />

Scan the QR code to join the WeChat user group for discussions, feedback, and updates.

- [GitHub Issues](https://github.com/op7418/CodePilot/issues) -- Bug reports and feature requests
- [GitHub Discussions](https://github.com/op7418/CodePilot/discussions) -- Questions and general discussion

---

## Contributing

1. Fork the repository and create a feature branch
2. `npm install` and `npm run electron:dev` to develop locally
3. Run `npm run test` before opening a PR
4. Submit a PR against `main` with a clear description

Keep PRs focused -- one feature or fix per pull request.

<details>
<summary>Development commands</summary>

```bash
npm run dev                    # Next.js dev server (browser)
npm run electron:dev           # Full Electron app (dev mode)
npm run build                  # Production build
npm run electron:build         # Build Electron distributable
npm run electron:pack:mac      # macOS DMG (arm64 + x64)
npm run electron:pack:win      # Windows NSIS installer
npm run electron:pack:linux    # Linux AppImage, deb, rpm
```

**CI/CD:** Pushing a `v*` tag triggers a full multi-platform build and creates a GitHub Release automatically.

**Notes:**
- Electron forks a Next.js standalone server on `127.0.0.1` with a random free port
- Chat data is stored in `~/.codepilot/codepilot.db` (dev mode: `./data/`)
- SQLite uses WAL mode for fast concurrent reads
</details>

---

## License

[Business Source License 1.1 (BSL-1.1)](LICENSE)

- **Personal / academic / non-profit use**: free and unrestricted
- **Commercial use**: requires a separate license — contact [@op7418 on X](https://x.com/op7418)
- **Change date**: 2029-03-16 — after which the code converts to Apache 2.0
