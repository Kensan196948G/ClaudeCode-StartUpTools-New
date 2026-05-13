# 🚀 ClaudeOS Boot Loader v9.0

## 📁 System Startup

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

## 🎯 Goal 選択

`state.json` の `goal_type` を読み、対応ファイルを Read すること。

```text
mvp-release        → ClaudeOS/goals/mvp-release.md
production-release → ClaudeOS/goals/production-release.md
hotfix             → ClaudeOS/goals/hotfix.md
security-emergency → ClaudeOS/goals/security-emergency.md
refactoring        → ClaudeOS/goals/refactoring.md
```

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
