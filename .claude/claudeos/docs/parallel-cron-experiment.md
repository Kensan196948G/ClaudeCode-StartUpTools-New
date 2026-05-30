# 並列 Cron 実験ガイド — 2セッション同時実行

## 概要

1つのプロジェクトで CTO（実装担当）と QA（監視担当）を
別プロセスとして同時起動し、GitHub Issues 経由で協調する実験。

---

## アーキテクチャ

```
Linux cron
  ├─ Session A: CTO ロール（実装・PR作成・マージ判断）
  │    claude -p "$(cat ~/.claudeos/roles/cto-build.md)" --project <ProjectName>
  │
  └─ Session B: QA ロール（テスト監視・品質チェック・報告）
       claude -p "$(cat ~/.claudeos/roles/qa-monitor.md)" --project <ProjectName>

通信チャネル: GitHub Issues（[AGENT-MSG] ラベル付き）
共有状態:    state.json（排他制御は atomic write で担保）
```

---

## ロールファイル

### CTO ロール: `~/.claudeos/roles/cto-build.md`

```markdown
あなたは CTO ロールで動作します。

責務: 実装・PR作成・マージ判断
制約:
- QA からの [AGENT-MSG] を30分ごとに確認する
- QA が fail を報告した場合は実装を一時停止する
- state.json への書き込みは session-end hook に任せる（直接書き込み禁止）

セッション開始時:
1. gh issue list --label "agent-msg,agent:qa,status:open" を確認
2. gh issue list --state open --limit 10 を確認
3. 優先度の高いタスクから実装開始

/goal "Issue #XX 実装完了・CI成功・PR作成済み、または stop after 15 turns"
```

### QA ロール: `~/.claudeos/roles/qa-monitor.md`

```markdown
あなたは QA ロール（監視担当）で動作します。

責務: テスト実行・CI 監視・品質報告
制約:
- 実装は行わない（読み取りとテスト実行のみ）
- 問題を発見したら GitHub Issue に [AGENT-MSG] として報告する
- CTO の実装を妨害しない（Issues コメントのみ）

セッション開始時:
1. gh run list --limit 5 で CI 状態を確認
2. 失敗があれば CTO に報告: gh issue create --label "agent-msg,agent:qa,priority:urgent" ...
3. テストを実行して結果を記録する

/goal "CI 全通過確認・品質レポート作成済み、または stop after 10 turns"
```

---

## cron 設定例（Linux）

```bash
# ~/.claudeos/cron-parallel-launcher.sh
#!/bin/bash
PROJECT=$1

# CTO セッション（バックグラウンド）
claude -p "$(cat ~/.claudeos/roles/cto-build.md)" \
  --project "$PROJECT" \
  --output-format stream-json \
  > ~/.claudeos/logs/${PROJECT}-cto.log 2>&1 &
CTO_PID=$!

# 5分遅延して QA セッション起動（CTO が先に起動するため）
sleep 300

# QA セッション（バックグラウンド）
claude -p "$(cat ~/.claudeos/roles/qa-monitor.md)" \
  --project "$PROJECT" \
  --output-format stream-json \
  > ~/.claudeos/logs/${PROJECT}-qa.log 2>&1 &
QA_PID=$!

echo "CTO PID=$CTO_PID QA PID=$QA_PID" > ~/.claudeos/${PROJECT}-parallel.pid

# 両セッションの完了を待つ（最大5時間）
wait $CTO_PID $QA_PID
echo "Parallel session completed for $PROJECT"
```

---

## デッドロック防止ルール

1. **state.json の読み書き**: CTO のみが session-end hook で更新。QA は読み取り専用
2. **同一ファイルの同時編集**: 禁止。QA が編集が必要な場合は CTO に Issue で依頼
3. **PR の同時作成**: 禁止。CTO のみが PR を作成する
4. **GitHub Issue**: 両セッションが書き込み可能（ラベルで区別）

---

## 実験開始前チェックリスト

- [ ] GitHub Labels が作成済み（agent-msg, agent:cto, agent:qa 等）
- [ ] ~/.claudeos/roles/ に両ロールファイルが存在する
- [ ] ~/.claudeos/logs/ ディレクトリが存在する
- [ ] プロジェクトの state.json に trust.level >= 1 が設定済み
- [ ] Agent Communication Protocol を理解している

---

## 実装ステータス

| コンポーネント | 状態 |
|---|---|
| GitHub Issues メッセージバス | ✅ 実装済み |
| ラベル定義（agent-msg 等） | ✅ 作成済み |
| Issue テンプレート | ✅ 作成済み |
| ロールファイル | ⚠️ 手動作成が必要 |
| 並列 cron ランチャー | ⚠️ 上記スクリプトを手動配置 |
| 実際の並列実行テスト | ❌ 未実施（次回セッションで実験） |
