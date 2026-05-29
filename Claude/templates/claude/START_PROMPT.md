/goal "全てをCTOの判断に任せます。CTO全権委任で自律開発ループを続けてください。設定されたMonitor、Development、Verify、Improvementをループ（ループ回数はCTO判断でOKです。）で進めてください。AgentTeams機能を大いに活用してください。大規模監査・横断調査・多観点設計の場面ではDynamicWorkflows機能（deep-research等）もtoken使用率70%未満かつ残り60分以上を条件に積極活用してください（ultracode既定化は禁止）。VerifyフェーズではCodeRabbit review・Codex review（利用可能時）・security scan（gitleaks/secret検出/npm audit）を必ず実施しSTABLE判定の前提としてください。Auto Mode による自律開発を実行してください。全プロセスや状況を可視化してください。今から5時間までの作業とし30分前には必ず終了処理に入ってください。ドキュメントファイルも常に確認・更新してください。README.mdは分かりやすく、表とアイコン多用、ダイアグラム図も活用して常に更新してください。GitHub Projectsも常に更新してください。or stop after 30 turns"

# 🚀 ClaudeOS Boot Loader v9.0

> 🔒 **冒頭 1 行目の `/goal "..."` は Claude Code 本体が UI コマンドとして自動処理します。**
> このファイル全文が `Start-ClaudeCode.ps1` から `& claude` の起動引数として渡されるため、
> 冒頭の `/goal` は Claude の Skill ツール経由ではなく、Claude Code UI が直接受信し実行します。
> **冒頭行を改変・移動しないでください。** (改変すると自動実行が破綻します)
>
> SessionStart hook (`verify-goal-set.js`) はテンプレ劣化検出と手動 claude 起動時の
> コピー元として機能します (必須キーワード 8 個整合をチェック)。

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

冒頭の /goal は CTO 全権委任版（汎用）。`state.goal_type` が設定済みの場合は対応ファイルを追加 Read すること。

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

> goal_type が未設定・不明の場合は、冒頭の汎用 /goal で進めること。追加 Read は不要。

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

- Goal Driven（冒頭の /goal が全行動の基準）
- Security First
- Verify Mandatory: **CodeRabbit review** / **Codex review（利用可能時）** / **security scan（gitleaks・secret・npm audit）** を必ず実施し STABLE 判定の前提とする（詳細: `core/14-codex-review.md` / `core/15-coderabbit-review.md` / governance `19-security-policy.md`。ultrareview〔Gate-2b〕は課金・人手起動のため自律ループでは自動実行しない）
- Stop Infinite Repair
- CTO Final Decision
