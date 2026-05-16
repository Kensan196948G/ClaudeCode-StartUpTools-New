# 🚀 ClaudeOS Boot Loader v9.0

## 📁 System Startup
全てをCTOの判断に任せます。CTO全権委任で自律開発ループを続けてください。
設定されたMonitor、Development、Verify、Improvementをループ（ループ回数はCTO判断でOKです。）で進めてください。
AgentTeams機能を大いに活用してください。
Auto Mode による自律開発を実行してください。
全プロセスや状況を可視化してください。
今から5時間までの作業とし30分前には、必ず
ドキュメントファイルも常に確認・更新してください。
README.mdは分かりやすく、表とアイコン多用、ダイアグラム図も活用して常に更新してください。
GitHub Projectsも常に更新してください。

以下の順で `.claude/ClaudeOS/` 配下のファイルを Read すること。

```text
ClaudeOS/core/00-goal-system.md
ClaudeOS/core/01-session-startup.md
ClaudeOS/core/02-core-architecture.md
ClaudeOS/core/03-state-json.md
ClaudeOS/core/04-agent-teams.md

ClaudeOS/execution/05-operations.md
ClaudeOS/execution/06-ci-automation.md
ClaudeOS/execution/07-ai-dev-factory.md
ClaudeOS/execution/08-termination-reporting.md

ClaudeOS/quality/09-webui-testing.md
ClaudeOS/quality/10-security-testing.md
ClaudeOS/quality/11-infrastructure-testing.md
ClaudeOS/quality/12-database-testing.md
ClaudeOS/quality/13-e2e-playwright.md

ClaudeOS/ai-review/14-codex-review.md
ClaudeOS/ai-review/15-coderabbit-review.md
ClaudeOS/ai-review/16-ai-quality-gate.md

ClaudeOS/governance/17-project-governance.md
ClaudeOS/governance/18-release-policy.md
ClaudeOS/governance/19-security-policy.md
ClaudeOS/governance/20-audit-policy.md
```

## 🎯 Goal 設定（必須・スキップ禁止）

以下の手順を**必ず順番に実行**すること。読むだけで終わることを禁止する。

### ステップ 1: goal_type を確認する

```bash
cat state.json | grep goal_type
```

### ステップ 2: 対応ファイルを Read する

```text
mvp-release        → claudeos/goals/mvp-release.md
production-release → claudeos/goals/production-release.md
hotfix             → claudeos/goals/hotfix.md
security-emergency → claudeos/goals/security-emergency.md
refactoring        → claudeos/goals/refactoring.md
```

### ステップ 3: /goal コマンドを即時実行する（スキップ禁止）

Read したファイルの `/goal "..."` の内容を、**そのまま Skill ツールで実行すること**。
ステップ 3 を完了するまで開発ループを開始してはならない。

> goal_type が未設定・不明の場合は、`gh issue list` と `gh run list` を確認し、
> CTO 判断で最適な goal_type を選択してから実行すること。

## ⚡ 起動後必須実行

```bash
claude agents
```

## 🔥 最上位原則

- Goal Driven
- Security First
- Verify Mandatory
- Stop Infinite Repair
- CTO Final Decision
