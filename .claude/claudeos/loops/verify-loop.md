# Verify Loop

## Role
品質検証とCI確認。

---

## Checks

- code review
- unit tests
- integration tests
- lint
- build
- CI stability

---

## Trigger

- Build後
- 修正後

---

## Actions

- テスト実行
- CI確認
- 品質評価

---

## Output

`reports/.loop-verify-report.md`

---

## Next

- 成功 → Improve Loop
- 失敗 → CI Manager / Auto Repair

---

## STABLE Check

**Step 1 — Outcome Grader 起動**
`outcome-grader` エージェントを起動し `system/stable-rubric.json` の全 criteria を評価する。
採点結果は `reports/.loop-verify-report.md` へ追記する。

**Step 2 — 手動補完**
outcome-grader が skip した項目を手動確認し、終了報告の '未実行の検証' 区分に記載する。

以下を評価（正本: `system/stable-rubric.json`）：

- test success
- CI success
- lint success
- build success
- error 0
- security issue 0
- review OK
- Gate-1 実行済み（Verify フェーズ毎回）
- Gate-2 実行済み（PR 作成直前のみ）

**合否判定**
- `required: true` 全 8 項目 pass → **STABLE 合格** → consecutive_success +1
- 1 項目でも fail → **Auto Repair**（最大 15 回 / 同一エラー 3 回で Blocked → Issue 起票）

---

## 5h Rule

- 未完でも評価を残す