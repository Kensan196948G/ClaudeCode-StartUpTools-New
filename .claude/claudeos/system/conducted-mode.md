# Conducted Mode — Agent Teams (公式) + Agent View 併用運用 (reference, non-normative)

> **位置づけ**: 本書は ClaudeOS v8.3+ における **第三の運用モード** のリファレンス。
> 既存の `cron_autonomous` (無人 cron) / `manual_subagent` (対話 SubAgent) を強制的に上書きしない。
> CTO が大型変更・障害復旧・複数 Issue 並走を指揮する場面でのみ採用する選択肢を提供する。
>
> **矛盾時の優先**: 本書と CLAUDE.md / agent-teams-light-mode.md が矛盾した場合は **本書を無視** する。

## 1. なぜ conducted モードが必要か

ClaudeOS v8 の標準は SubAgent ベースの 12 役割（CLAUDE.md §6）であり、これは無人 cron 実行と相性が良い。
一方で以下の場面では **真の並列セッション** が欲しい:

- **Verify を 30 分以内に収束させたい** — QA / Reviewer / Security / DevOps / e2e-runner / security-reviewer を並列起動
- **複数 Issue を同時開発したい** — Issue#A の Developer + Issue#B の Reviewer + Issue#C の Security が並走
- **障害復旧** — Debugger が rescue 中に Developer が並行修正、QA が回帰テスト並走
- **大型変更** — Architect 設計と Developer 実装と Reviewer レビューが時間差で重なる

これらは SubAgent の逐次起動では時間がかかりすぎる、または context window を圧迫する。

## 2. 採用条件 (どれか一つでも欠ければ採用不可)

- ✅ Claude Code v2.1.32 以上
- ✅ `.claude/settings.json` で `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- ✅ Claude Code v2.1.139 以上（Agent View デフォルト有効）
- ✅ **人間 CTO がローカル端末に在席**できる時間帯
- ✅ `state.json:operation_mode.current="conducted"` を明示宣言
- ✅ 残時間 ≥ 60 分（teammate spawn 時）

## 3. アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│ 👔 CTO セッション (= Agent Teams Lead)               │
│   役割: 指揮・優先順位判定・5時間制御・集約          │
│   状態: state.json / Memory MCP に常時 mirror        │
└──────────────────────────────────────────────────────┘
                  ↓ spawn (フェーズ別 on-demand)
┌──────────────────────────────────────────────────────┐
│ 🪟 Agent View — 一画面で全 teammate を可視化         │
│                                                       │
│  📋 ProductManager  🏛️ Architect  💻 Developer        │
│  🔍 Reviewer        🧪 QA          🔒 Security        │
│  🐛 Debugger        ⚙️ DevOps      📊 Analyst         │
│  🧬 EvolutionMgr    🚀 ReleaseMgr                     │
└──────────────────────────────────────────────────────┘
```

## 4. spawn 計画 (フェーズ別)

CLAUDE.md §6「Agent 起動順序」をフェーズ別 teammate spawn 計画として実体化する。

| フェーズ | spawn する teammate | 並列度 | 概算消費 |
|---|---|---|---|
| Monitor | ProductManager / Analyst / Architect / DevOps | 4 並列 | 中 |
| Development | Architect → (Developer + Reviewer) | 2 並列 (Architect 後) | 中 |
| Verify | QA + Reviewer + Security + DevOps + e2e-runner + security-reviewer | 6 並列 | **高** |
| Repair | Debugger → (Developer + Reviewer + QA + DevOps) | 4 並列 (Debugger 後) | 中 |
| Improvement | EvolutionManager + ProductManager + Architect + Developer + QA | 5 並列 | 中 |
| Release | ReleaseManager → (Reviewer + Security + DevOps) → CTO | 3 並列 | 中 |

**全員 (12 役割) 同時起動は禁止**。トークン爆発と公式制約「1 リード=1 チーム」両方を踏むため。

## 5. teammate bootstrap

公式仕様により teammates は `skills` / `mcpServers` を継承しない。
役割別 spawn スクリプトで bootstrap する（雛形配置場所: `.claude/claudeos/scripts/teamspawn/spawn-<role>.sh`）:

| 役割 | bootstrap で起動すべき MCP / Skill |
|---|---|
| Reviewer | GitHub MCP, Codex CLI |
| Security | GitHub MCP, secret scanner |
| QA | playwright, axe-core |
| DevOps | GitHub MCP, CI ログ取得 |
| e2e-runner | playwright |
| security-reviewer | secret scanner, dependency-check |

雛形 spawn スクリプトは段階的に追加する。当面は CTO が手動で teammate 起動時に必要 MCP を渡す運用でよい。

## 6. state.json ミラー (graceful shutdown 必須前提)

teammates の進捗を `state.json:agent_teams.teammates[]` に**毎フェーズ終了時**ミラーする。
これにより 5h 強制終了 / PreCompact / Token 枯渇でも teammates の作業状況が失われない。

ミラー項目:

| キー | 内容 |
|---|---|
| `role` | `Developer` / `Reviewer` 等の役割名 |
| `status` | `working` / `needs_input` / `completed` / `failed` / `stopped` |
| `worktree` | 担当 WorkTree のパス（あれば） |
| `last_commit` | 直近の commit SHA |
| `last_message_at` | 最終メッセージ時刻 |
| `assigned_issue` | 担当 Issue 番号（あれば） |
| `notes` | リード CTO のメモ |

書き込み主体: リード CTO (フェーズ遷移時) + `session-end.js` (Stop hook 時)。

## 7. graceful shutdown フロー（5h 到達時）

```
経過 270 分 (5h − 30min) に到達
  │
  ▼
リード CTO が graceful shutdown フェーズへ移行宣言
  │
  ├─ 全 teammates に "commit & push & 状況報告" 指令
  ├─ teammates から状況回収 → state.json:agent_teams.teammates[] へ書き込み
  ├─ Memory MCP に「再開時 spawn 計画」を記録
  │
  ▼
CLAUDE.md §15 の 9 ステップ実行
  │
  ├─ 各 teammate の Draft PR 作成（最大同時 1 リード=1 チームのため逐次）
  ├─ teammates 達成状況テーブルを最終報告に含める
  │
  ▼
リード CTO が応答終了 → ユーザが `/exit` または端末閉じ
```

**OS shutdown でも `Ctrl+C` 強制終了でもない**。アプリ層手続きのみ。

## 8. 次セッションでの復元

session resume で **teammates 自体は復元不可** (公式制約)。

復元手順:

1. session-start.js が `state.json:agent_teams.teammates[]` を読む
2. リード CTO が「前回どこまで進んだか」を要約
3. 必要な teammate のみ spawn 計画を再作成
4. 新規 teammate として再 spawn（前回履歴は state.json から渡す）

## 9. 既知制約と緩和策

| 制約 | 緩和策 |
|---|---|
| 1 リード = 1 チーム | 複数 Issue 並走は WorkTree 並列で対応、別端末で別 CTO セッション可 |
| teammates resume 不可 | state.json + Memory MCP ミラーで spawn 計画のみ復元 |
| shutdown 遅延 | 5h − 30 分から graceful shutdown 開始（既定 4h30m で確実に閉じる） |
| skills / MCP 非継承 | teamspawn スクリプトで明示 bootstrap |
| ネストチーム禁止 | フラット 12 役割で運用、Architect の sub-helper は SubAgent で代替 |
| トークン倍増 | on-demand spawn、§13 70% 超で新規 spawn 禁止 |
| ローカル TUI 必須 | cron 無人運用では使用しない（モード分離） |

## 10. 採用しない場合

`state.json:operation_mode.current` を `cron_autonomous` または `manual_subagent` のままにする。
本書の存在を無視してよい。SubAgent ベースの従来運用が継続される。

## 11. 関連ドキュメント

- `CLAUDE.md §3` 三層運用モデル — 本書の上位規約
- `CLAUDE.md §6` Agent Teams 役割定義 — 共通の役割表
- `CLAUDE.md §10` Agent View 監視手順
- `CLAUDE.md §15` graceful shutdown 9 ステップ
- `.claude/claudeos/system/agent-teams-light-mode.md` — SubAgent ベース運用の軽量版
- `.claude/claudeos/scripts/hooks/session-end.js` — teammates snapshot ミラー実装
