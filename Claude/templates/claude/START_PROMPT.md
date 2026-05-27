# 🚀 ClaudeOS Boot Loader v9.0

## 🔒 ステップ A: /goal を **ユーザーに提示**（最優先・改変禁止）

> ⚠️ `/goal` は Claude Code の **UI コマンド**であり、Claude (Skill ツール) からは実行できません。
> 以下のコードブロックの内容を **そのままユーザーに提示**し、ユーザー自身に対話プロンプトへ入力してもらってください。

Claude は以下のように案内すること:
> 「セッション開始のため、以下の `/goal` をご自身で実行してください」
> （その後、下記のコードブロックをそのまま表示）

ユーザー入力を**待たずに**ステップ B 以降の作業に進んで構いません (/goal は会話途中で入力されてもセッション全体に適用されます)。

**禁止事項（違反した場合は再提示）:**
- ❌ 文面の要約・短縮・整形 (コピペ前提)
- ❌ 改行位置・句読点の変更
- ❌ Skill ツール経由で `/goal` を実行しようとすること (UI 専用コマンドのため失敗します)

```text
/goal "全てをCTOの判断に任せます。CTO全権委任で自律開発ループを続けてください。設定されたMonitor、Development、Verify、Improvementをループ（ループ回数はCTO判断でOKです。）で進めてください。AgentTeams機能を大いに活用してください。Auto Mode による自律開発を実行してください。全プロセスや状況を可視化してください。今から5時間までの作業とし30分前には必ず終了処理に入ってください。ドキュメントファイルも常に確認・更新してください。README.mdは分かりやすく、表とアイコン多用、ダイアグラム図も活用して常に更新してください。GitHub Projectsも常に更新してください。or stop after 30 turns"
```

> ℹ️ SessionStart hook (`verify-goal-set.js`) がこの /goal 本文を自動的に画面提示し、必須キーワード（CTO全権委任 / Monitor / Verify / AgentTeams / 5時間 / README / GitHub Projects / stop after）の存在を検証します。テンプレ劣化時は警告が出るので、その場合は本ブロックを修正してください。

## 📚 ステップ B: ClaudeOS ファイルを順に Read する

以下の順で `.claude/claudeos/` 配下のファイルを Read すること。

```text
claudeos/core/00-goal-system.md
claudeos/core/01-session-startup.md
claudeos/core/02-core-architecture.md
claudeos/core/03-state-json.md
claudeos/core/04-agent-teams.md

claudeos/execution/05-operations.md
claudeos/execution/06-ci-automation.md
claudeos/execution/07-ai-dev-factory.md
claudeos/execution/08-termination-reporting.md

claudeos/quality/09-webui-testing.md
claudeos/quality/10-security-testing.md
claudeos/quality/11-infrastructure-testing.md
claudeos/quality/12-database-testing.md
claudeos/quality/13-e2e-playwright.md

claudeos/ai-review/14-codex-review.md
claudeos/ai-review/15-coderabbit-review.md
claudeos/ai-review/16-ai-quality-gate.md

claudeos/governance/17-project-governance.md
claudeos/governance/18-release-policy.md
claudeos/governance/19-security-policy.md
claudeos/governance/20-audit-policy.md
```

## 🎯 ステップ C: goal_type 別ファイル Read（補助）

ステップ A の /goal は CTO 全権委任版（汎用）。`state.goal_type` が設定済みの場合は対応ファイルを追加 Read すること。

```bash
cat state.json | grep goal_type
```

```text
mvp-release        → claudeos/goals/mvp-release.md
production-release → claudeos/goals/production-release.md
hotfix             → claudeos/goals/hotfix.md
security-emergency → claudeos/goals/security-emergency.md
refactoring        → claudeos/goals/refactoring.md
```

> goal_type が未設定・不明の場合は、ステップ A の汎用 /goal で進めること。追加 Read は不要。

## 🛡️ ステップ D: Trust Level 確認（必須）

### D-1: trust-score.json を Read

```text
.claude/claudeos/data/trust-score.json
```

### D-2: trust.level に応じた許可操作範囲を確認

```text
Level 1 (score 0.00-0.84): ファイル編集・テスト実行・Issue起票・Draft PR
Level 2 (score 0.85-0.94): + PR作成・auto_merge（CI全通過時）
Level 3 (score 0.95-1.00): + Staging デプロイ
※ 本番デプロイは全 Level で人間サインオフ必須
```

### D-3: エージェントメッセージ確認

```bash
gh issue list --label "agent-msg,status:open" --limit 10
```

`priority:urgent` のメッセージは現在の作業を中断して最優先で処理すること。

## ⚡ ステップ E: 起動後必須実行

```bash
claude agents
```

## 🔥 最上位原則

- Goal Driven（ステップ A の /goal が全行動の基準）
- Security First
- Verify Mandatory
- Stop Infinite Repair
- CTO Final Decision
