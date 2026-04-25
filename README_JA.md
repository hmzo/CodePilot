<img src="docs/icon-readme.png" width="32" height="32" alt="CodePilot" style="vertical-align: middle; margin-right: 8px;" /> CodePilot
===

**Claude Code 用デスクトップ GUI** -- インストーラーに Claude Code ネイティブバイナリを同梱（Node.js も別途インストールも不要）、認証情報とモデルは `~/.claude` から直接読み取ります。MCP とスキルで拡張、スマートフォンからリモート制御、アシスタントがあなたのワークフローを学習。

[![GitHub release](https://img.shields.io/github/v/release/op7418/CodePilot)](https://github.com/op7418/CodePilot/releases)
[![Downloads](https://img.shields.io/github/downloads/op7418/CodePilot/total)](https://github.com/op7418/CodePilot/releases)
[![GitHub stars](https://img.shields.io/github/stars/op7418/CodePilot)](https://github.com/op7418/CodePilot/stargazers)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/op7418/CodePilot/releases)
[![License](https://img.shields.io/badge/license-BSL--1.1-orange)](LICENSE)

[English](./README.md) | [中文文档](./README_CN.md)

![CodePilot](https://github.com/user-attachments/assets/9750450a-9f6f-49ce-acd4-c623a4e24281)

---

[ダウンロード](#ダウンロード) | [クイックスタート](#クイックスタート) | [ドキュメント](#ドキュメント) | [コントリビュート](#コントリビュート) | [コミュニティ](#コミュニティ)

---

## ダウンロード

| プラットフォーム | ダウンロード | アーキテクチャ |
|---|---|---|
| macOS | [Apple Silicon (.dmg)](https://github.com/op7418/CodePilot/releases/latest) · [Intel (.dmg)](https://github.com/op7418/CodePilot/releases/latest) | arm64 / x64 |
| Windows | [インストーラー (.exe)](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |
| Linux | [AppImage](https://github.com/op7418/CodePilot/releases/latest) · [.deb](https://github.com/op7418/CodePilot/releases/latest) · [.rpm](https://github.com/op7418/CodePilot/releases/latest) | x64 + arm64 |

または [Releases](https://github.com/op7418/CodePilot/releases) ページで全バージョンを確認できます。

---

## CodePilot を選ぶ理由

### `~/.claude` ひとつだけで動く

CodePilot は独自にプロバイダー一覧を持ちません。認証情報 / Base URL / デフォルトモデルはすべて `~/.claude/settings.json`（または `claude` ログインセッション）から読み取られます。モデルセレクターには公式の Claude Sonnet / Opus / Haiku がハードコードされ、SDK の `model` オプションで直接指定。OpenRouter、Volcengine、Bedrock などのゲートウェイを使いたい場合は、Anthropic 互換エンドポイントとして `~/.claude` に書くだけです。

### コーディングだけじゃない — フル AI エージェント

CodePilot はコーディングツールとして始まりましたが、**汎用 AI エージェント デスクトップ**へと進化しました：

- **Assistant Workspace** — ペルソナファイル、永続メモリ。アシスタントがあなたの好みを学び、適応し続けます。
- **ジェネレーティブ UI** — AI がインタラクティブなダッシュボード、チャート、ビジュアルウィジェットを作成し、アプリ内でリアルタイムにレンダリング。
- **リモート Bridge** — Telegram、Feishu、Discord、QQ、WeChat に接続。スマートフォンからメッセージを送り、デスクトップで返答を受け取れます。
- **MCP + スキル** — MCP サーバー（stdio / sse / http）を追加し、ランタイム監視。再利用可能なスキルを定義するか、skills.sh マーケットプレイスからインストール。
- **Media Studio** — AI 画像生成、バッチタスク、ギャラリー、タグ管理。

### 日常使いのために設計

- セッションの一時停止、再開、**チェックポイントへの巻き戻し**
- **スプリットスクリーン**で 2 セッションを並行表示
- **トークン使用量とコスト**を日次チャート付きで追跡
- Claude Code CLI セッション履歴を直接読み取り
- ダーク / ライトテーマ切り替え
- English + Chinese インターフェース

---

## クイックスタート

### パス A：リリース版をダウンロード（ほとんどのユーザー向け）

1. 上の[ダウンロード](#ダウンロード)セクションからプラットフォームに合った CodePilot インストーラーをダウンロード
2. CodePilot を起動 — Claude Code はインストーラーに同梱済み、Node.js も追加インストールも不要
3. CodePilot 内で Anthropic アカウントにサインイン（または `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` を `~/.claude/settings.json` に手動で記述）
4. 入力欄でモデルを選択して会話を開始

### パス B：ソースからビルド（開発者向け）

| 前提条件 | 最小バージョン |
|---|---|
| Node.js | 18+ |
| npm | 9+（Node 18 に付属） |

```bash
git clone https://github.com/op7418/CodePilot.git
cd CodePilot
npm install
npm run dev              # ブラウザモード http://localhost:3000
# -- または --
npm run electron:dev     # フルデスクトップアプリ
```

---

## コア機能

### 会話とインタラクション

| 機能 | 詳細 |
|---|---|
| インタラクションモード | Code / Plan / Ask |
| 推論レベル | Low / Medium / High / Max + Thinking モード |
| 権限制御 | Default / Full Access、アクション単位の承認 |
| セッション制御 | 一時停止、再開、チェックポイントへの巻き戻し、アーカイブ |
| モデル切り替え | 会話中に Claude Sonnet / Opus / Haiku を切り替え |
| スプリットスクリーン | 2 つのセッションを並べて表示 |
| 添付ファイル | ファイルと画像、マルチモーダルビジョン対応 |
| スラッシュコマンド | /help /clear /cost /compact /doctor /review など |

### 拡張と統合

| 機能 | 詳細 |
|---|---|
| 設定の出所 | `~/.claude/settings.json` を直接読み取り — アプリ内で別途プロバイダーを設定する必要なし |
| MCP サーバー | stdio / sse / http、ランタイム状態監視 |
| スキル | カスタム / プロジェクト / グローバルスキル、skills.sh マーケットプレイス |
| Bridge | Telegram / Feishu / Discord / QQ / WeChat リモート制御 |
| CLI 連携 | Claude Code CLI .jsonl セッション履歴を読み取り |
| 画像生成 | Gemini 画像生成、バッチタスク、ギャラリー |

### データとワークスペース

| 機能 | 詳細 |
|---|---|
| Assistant Workspace | ペルソナファイル（soul.md、user.md、claude.md、memory.md）、永続メモリ |
| ジェネレーティブ UI | AI が作成するインタラクティブなダッシュボードとビジュアルウィジェット |
| ファイルブラウザ | プロジェクトファイルツリー、シンタックスハイライトプレビュー |
| Git パネル | ステータス、ブランチ、コミット、Worktree 管理 |
| 使用量分析 | トークン数、コスト見積もり、日次使用量チャート |
| ローカルストレージ | SQLite（WAL モード）、全データはローカルに保存 |
| i18n | English + Chinese |
| テーマ | ダーク / ライト、ワンクリック切り替え |

---

## 初回起動

1. **`~/.claude` を設定** — Claude Code はすでに同梱されているので、起動後 CodePilot 内で Anthropic アカウントにサインインするだけで OK。手動で設定したい場合は `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` を `~/.claude/settings.json` に記述。
2. **会話を作成** — 作業ディレクトリ、モード（Code / Plan / Ask）を選択し、入力欄でモデルを選択。
3. **Assistant Workspace を設定**（任意）— **設定 > Assistant** でワークスペースディレクトリを選択。CodePilot がワークスペースルートに `soul.md`、`user.md`、`claude.md`、`memory.md` を作成。
4. **MCP サーバーを追加**（任意）— サイドバーの **MCP** ページで MCP サーバーを追加・管理。カスタムスキルは **Skills** ページで管理。

---

## プラットフォームとインストール手順

macOS ビルドは Developer ID 証明書で署名済みですが、公証（notarize）は行われていないため、Gatekeeper が初回起動時に警告を表示する場合があります。Windows と Linux ビルドは未署名です。

<details>
<summary>macOS: Gatekeeper の初回起動時警告</summary>

**オプション 1** -- Finder で `CodePilot.app` を右クリック > 開く > 確認。

**オプション 2** -- システム設定 > プライバシーとセキュリティ > セキュリティまでスクロール >「このまま開く」をクリック。

**オプション 3** -- ターミナルで実行:
```bash
xattr -cr /Applications/CodePilot.app
```
</details>

<details>
<summary>Windows: SmartScreen がインストーラーをブロック</summary>

**オプション 1** -- SmartScreen ダイアログで「詳細情報」をクリック、次に「実行を続ける」。

**オプション 2** -- 設定 > アプリ > 詳細アプリ設定 > アプリインストール制御をどこからでも許可に設定。
</details>

---

## ドキュメント

📖 **完全ドキュメント:** [English](https://www.codepilot.sh/docs) | [中文](https://www.codepilot.sh/zh/docs)

**はじめに:**
- [クイックスタート](#クイックスタート) -- ダウンロードまたはソースからビルド
- [初回起動](#初回起動) -- `~/.claude` 設定、ワークスペースセットアップ
- [インストールガイド](https://www.codepilot.sh/docs/installation) -- 詳細なセットアップ手順

**ユーザーガイド:**
- [MCP サーバー](https://www.codepilot.sh/docs/mcp) -- Model Context Protocol サーバーの追加と管理
- [スキル](https://www.codepilot.sh/docs/skills) -- カスタムスキル、プロジェクトスキル、skills.sh マーケットプレイス
- [Bridge](https://www.codepilot.sh/docs/bridge) -- Telegram、Feishu、Discord、QQ、WeChat によるリモート制御
- [Assistant Workspace](https://www.codepilot.sh/docs/assistant-workspace) -- ペルソナファイル、メモリ
- [FAQ](https://www.codepilot.sh/docs/faq) -- よくある質問と解決方法

**開発者ドキュメント:**
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- アーキテクチャ、テックスタック、ディレクトリ構成、データフロー
- [docs/handover/](./docs/handover/) -- 設計決定、引き継ぎドキュメント
- [docs/exec-plans/](./docs/exec-plans/) -- 実行計画、技術的負債トラッカー

---

## FAQ

<details>
<summary>Claude Code CLI を別途インストールする必要はありますか？</summary>

ありません。CodePilot のインストーラーには公式の Claude Code ネイティブバイナリが同梱されているため、Node.js、npm、Bun、`curl claude.ai/install.sh` のいずれも不要です。実行時には常にこの同梱バイナリが使われます。マシンに別途インストールされた `claude`（あれば）は情報として表示されるだけで、呼び出されることはありません。ただし認証情報を渡すために、Anthropic アカウントへのサインインまたは `~/.claude/settings.json` の設定は引き続き必要です。
</details>

<details>
<summary>Anthropic 以外のプロバイダー（OpenRouter、Zhipu など）は使えますか？</summary>

使えます — ただし Claude Code 側で設定してください。`~/.claude/settings.json` の `ANTHROPIC_BASE_URL` と `ANTHROPIC_AUTH_TOKEN` をゲートウェイ（任意の Anthropic 互換エンドポイント）に向けるだけです。CodePilot は SDK が読むものに従うだけです。
</details>

<details>
<summary><code>npm run dev</code> と <code>npm run electron:dev</code> の違い</summary>

`npm run dev` は Next.js 開発サーバーのみを起動し、ブラウザで `http://localhost:3000` を使用します。`npm run electron:dev` は Next.js と Electron シェルの両方を起動し、ネイティブウィンドウコントロールを含むフルデスクトップアプリを提供します。
</details>

<details>
<summary>ワークスペースファイルの場所</summary>

ワークスペース設定後、CodePilot は**ワークスペースルートディレクトリ**に 4 つの Markdown ファイルを作成: `soul.md`（パーソナリティ）、`user.md`（ユーザープロファイル）、`claude.md`（ルール）、`memory.md`（長期メモ）。状態管理（Onboarding 進捗、チェックイン日付）は `.assistant/` サブディレクトリに保存。デイリーメモリは `memory/daily/` に保存。
</details>

<details>
<summary>Bridge にはプラットフォームごとの追加設定が必要</summary>

各 Bridge チャンネル（Telegram、Feishu、Discord、QQ、WeChat）には独自の Bot トークンまたはアプリ認証情報が必要です。サイドバーの **Bridge** ページでチャンネルを設定してください。ターゲットプラットフォームで先にボットを作成し、トークンを CodePilot に提供する必要があります。
</details>

---

## コミュニティ

- [GitHub Issues](https://github.com/op7418/CodePilot/issues) -- バグ報告と機能リクエスト
- [GitHub Discussions](https://github.com/op7418/CodePilot/discussions) -- 質問と一般的なディスカッション

---

## コントリビュート

1. リポジトリをフォークしてフィーチャーブランチを作成
2. `npm install` と `npm run electron:dev` でローカル開発
3. PR を開く前に `npm run test` を実行
4. `main` に対して明確な説明付きの PR を提出

PR はフォーカスを保つ -- 1 つのフィーチャーまたは修正ごとに 1 つの PR。

<details>
<summary>開発コマンド</summary>

```bash
npm run dev                    # Next.js 開発サーバー（ブラウザ）
npm run electron:dev           # フル Electron アプリ（開発モード）
npm run build                  # 本番ビルド
npm run electron:build         # Electron 配布ファイルをビルド
npm run electron:pack:mac      # macOS DMG (arm64 + x64)
npm run electron:pack:win      # Windows NSIS インストーラー
npm run electron:pack:linux    # Linux AppImage, deb, rpm
```

**CI/CD:** `v*` タグをプッシュすると、全プラットフォームビルドが自動的にトリガーされ、GitHub Release が作成されます。

**メモ:**
- Electron は `127.0.0.1` 上で Next.js スタンドアロンサーバーをフォークし、ランダムなフリーポートで接続
- チャットデータは `~/.codepilot/codepilot.db`（開発モード: `./data/`）に保存
- SQLite は WAL モードを使用し、同時読み込みが高速
</details>

---

## ライセンス

[Business Source License 1.1 (BSL-1.1)](LICENSE)

- **個人 / 学術 / 非営利利用**: 無料かつ無制限
- **商用利用**: 別途ライセンスが必要 — 連絡先: [@op7418 on X](https://x.com/op7418)
- **変更日**: 2029-03-16 — 以降、Apache 2.0 に移行
