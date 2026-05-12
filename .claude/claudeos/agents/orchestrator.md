# Agent Orchestrator

Coordinates Agent Teams.

---

## Managed Agents 委譲パターン

ClaudeOS v8 の CTO リードエージェントが各フェーズで委譲先・推奨モデル・
ツールセットを宣言的に定義する。Anthropic Managed Agents Multiagent Orchestration
（Public Beta）の lead-agent → specialist 委譲パターンに準拠。

### フェーズ別委譲定義

| フェーズ | リード | 委譲先（起動順） | 推奨モデル | 並列可否 |
|---------|-------|----------------|-----------|---------|
| Monitor | CTO | ProductManager → Analyst → Architect → DevOps | Haiku / Sonnet | 並列可（依存なし） |
| Build | Architect | Developer → Reviewer | Sonnet / Opus | 逐次（設計先行） |
| Verify | QA | security-reviewer + e2e-runner + outcome-grader | Sonnet | 並列可 |
| Repair | Debugger | Developer → Reviewer → QA → DevOps | Sonnet | 逐次 |
| Improve | EvolutionManager | ProductManager → Architect → Developer → QA | Sonnet | 並列可 |
| Release | ReleaseManager | Reviewer → Security → DevOps → CTO | Opus | 逐次（サインオフ） |

### タスク委譲原則

- リードエージェントはタスク分解と統制に専念し、自分ではコード編集しない
- 各サブエージェントは担当境界（ファイル・フェーズ・責務）内のみで作業する
- 返却は `role-contracts.md` の 4 セクション形式（Summary / Risks / Findings / Next Action）
- 共有ファイル（state.json / README.md）の writer は 1 エージェントに限定する

### 並列実行時の排他制御

- 並列エージェントの担当ファイル境界を事前宣言する
- state.json の書き込みは session-end.js の atomic write（temp + rename）に委ねる
- WorkTree: 1 Issue = 1 WorkTree（並列実行 OK、main 直接 push 禁止）

### Orchestration Event Log

各委譲の完了時に以下の形式で state.json の `execution.orchestration_events` へ追記する。
pre-compact.js がスナップショット時に最新 10 件を evacuation-latest.json へ転写する。

```json
{
  "event": "delegation_complete",
  "phase": "<Monitor|Build|Verify|Repair|Improve|Release>",
  "agent": "<agent_name>",
  "result": "pass | fail | blocked",
  "timestamp": "<ISO8601>"
}
```

### Light / Full モード

| モード | 判断基準 |
|-------|---------|
| **light**（既定） | 差分 < 50 行 / 1 ファイル修正 / lint / doc |
| **full** | 差分 ≥ 50 行 or 3 ファイル以上 / 新機能 / 認証・DB 変更 |

full への昇格はリードエージェントが理由を明示する。

---

## 参照

- `system/role-contracts.md` — Orchestrator-Subagent パターン詳細
- `CLAUDE.md §6` — Agent Teams 起動チェーン
- `system/loop-guard.md` — 停止条件・Loop Guard

## 停止理由出力（Agent View 可視化）

タスク完了・中断・エラー時は必ず末尾に以下を出力する:

```
[停止理由]
- 状態: 完了 / 中断 / エラー待ち / ブロック
- 理由: <具体的な理由 1行>
- 次アクション: <引き継ぎ先または次ステップ>
```