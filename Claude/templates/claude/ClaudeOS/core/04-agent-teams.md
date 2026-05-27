# 04-agent-teams — Agent Teams 設計 (v9.0)

## 🎯 目的

ClaudeOS v9.0 を単体 AI ではなく、複数役割を持つ仮想開発組織として運用する。
`/goal` で設定した目標に対し、CTO が状況に応じてパターン A/B/C を自律選択する。

---

## 🧑‍💼 基本チーム構成

| Agent | 役割 |
|---|---|
| CTO | 全体判断・優先順位・/goal 管理・リリース責任 |
| Manager | Issue 管理・進捗管理・Project 同期 |
| Architect | 設計・技術選定・構造レビュー |
| DevAPI | API / Backend 実装 |
| DevUI | Frontend / UI 実装 |
| QA | テスト設計・品質保証 |
| Tester | 実行検証・再現確認 |
| CIManager | GitHub Actions / CI 修復 |
| Security | 脆弱性・権限・秘密情報確認 |
| ReleaseManager | リリース判定・最終報告 |
| CMDB-Agent | 構成管理・依存関係マップ・変更影響分析 |
| Audit-Agent | 変更証跡・ISO/J-SOX 規格準拠・監査レポート |

---

## 🤝 Agent Teams パターン（v9.0 新設）

### パターン A: 並列実装（複数機能の同時開発）

```
Lead: CTO（統制・統合）
Teammate 1: Backend 実装（API / DB / ロジック）
Teammate 2: Frontend 実装（UI / UX）
Teammate 3: テスト設計・検証
```

使用場面: 複数機能の並列実装

### パターン B: 品質強化（CI 失敗修復・リリース前）

```
Lead: CTO（統制・判断）
Teammate 1: バグ修復・CI 修復
Teammate 2: セキュリティレビュー
Teammate 3: 回帰テスト
```

使用場面: CI 失敗 + Security + テスト同時対応

### パターン C: 調査・設計（アーキテクチャ検討）

```
Lead: CTO（統制・意思決定）
Teammate 1: 技術調査
Teammate 2: アーキテクチャ設計
Teammate 3: Devil's Advocate（反証・リスク指摘）
```

使用場面: 大規模設計検討・多観点が必要な場面

---

## 👁 Agent View（v9.0）

```bash
claude agents
```

| アイコン | 状態 |
|---|---|
| ✽ | Working（実行中） |
| ✻ | Needs Input（入力待ち） |
| ✙ | Idle（アイドル） |
| ✔ | Completed（完了） |
| ✘ | Failed（失敗） |

操作: Space（Peek・返信）/ Enter（Attach・直接接続）

**Agent View は監視・観測のみ担当。意思決定は CTO が行う。**

---

## 📊 計測と可視化（v9.0+ 追加）

### 計測 hook

`.claude/claudeos/scripts/hooks/agent-teams-tracker.js` が **PostToolUse** で
`TeamCreate` / `SendMessage` の呼び出しを検出し、`state.agent_teams_usage` に記録する。

記録項目:
- `current_session.team_create_count` / `send_message_count`
- `current_session.teammates[]`（spawn された teammate 名と subagent_type）
- `current_session.patterns_used[]`（現フェーズから推定: Build→A / Verify→B / Monitor→C）
- `history[]`（過去 50 セッション分の集計）

### Dashboard 監視（Agent View 代替）

`claude agents` (TUI) は別端末必須で Claude 内側から起動不可のため、
**Mission Control ダッシュボードを Agent View 代替**として位置付ける。

```bash
node scripts/dashboards/serve-dashboard.js
# → http://localhost:3737/mission-control
```

新規エンドポイント:
- `GET /api/agent-teams` → `state.agent_teams_usage` の集計を返す

Agent Teams タブ内の **Agent Teams Activity バッジ** で以下を 30 秒ごとに自動更新表示:
- 現セッションの TeamCreate / SendMessage 回数
- 現セッションで使用されたパターン
- 直近 7 日のパターン別使用回数

### SessionStart 推奨パターン提示

`session-start.js` hook が起動時に `state.execution.phase` を読み取り、
対応する Agent Teams パターン (A/B/C) を CTO Agent に提示する（強制ではなく指針）。

| フェーズ | 推奨パターン |
|---|---|
| Build / Development | A — 並列実装 |
| Verify / Quality / Repair | B — 品質強化 |
| Monitor / Research / Design | C — 調査・設計 |

---

## ⚖️ Sub-agent vs Agent Teams

| 基準 | Sub-agent（Task） | Agent Teams |
|---|---|---|
| コンテキスト | 結果を呼び出し元に返す | 各自独立ウィンドウ |
| 通信 | 親エージェントへ報告のみ | Teammate 間で直接通信可 |
| トークンコスト | 低 | 高 |
| 使用場面 | Lint 修正・単機能・docs 更新 | 複数機能並列・多観点協調 |

**Agent Teams 使用条件:**

| 場面 | 判断 |
|---|---|
| 複数機能の並列実装 | ✅ パターン A |
| CI + Security + テスト同時 | ✅ パターン B |
| 大規模設計検討 | ✅ パターン C |
| 1 ファイル修正 / Lint / docs | ❌ Sub-agent で十分 |

---

## 🔁 Agent ログフォーマット

```text
[👔 CTO / 最高技術責任者] 判断:
[💻 Developer / デベロッパー] 実装:
[🧪 QA / 品質保証] 検証:
[🔒 Security / セキュリティ] リスク:
[⚙️ DevOps / 運用基盤] CI状態:
[🗄️ CMDB-Agent / 構成管理] 影響範囲分析:
[📋 Audit-Agent / 監査] 証跡確認・規格準拠:
```

---

## 🚫 禁止事項

- Agent 判断なしの merge
- QA 確認なしの Done 移動
- Security 未確認の release
- Release 期の新機能追加
- 同一原因エラーの無限修復（2 回で停止）
