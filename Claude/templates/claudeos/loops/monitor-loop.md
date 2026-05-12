# Monitor Loop

## 役割

現状確認、接続状況確認、タスク整理、タイムスケジュール生成を行う。

## このループと判定する条件

- 状態確認が主作業
- 実装や修復をまだしていない
- Projects、Issue、CI の把握が主目的

## 禁止

- 実装
- 修復

## CMDB-Agent 起動（Monitor フェーズ末尾・必須）

Monitor フェーズの最後に **CMDB-Agent** を SubAgent として起動し、以下を実施する:

| 確認項目 | 内容 |
|---|---|
| 構成アイテム差分 | 前回セッションからの変更ファイル・設定変更を列挙 |
| 影響範囲分析 | 変更対象に依存する上流・下流サービスを特定 |
| CI/CD 構成状態 | ワークフロー設定の変更有無を確認 |

```
Agent({
  description: "CMDB - Monitor phase config check",
  subagent_type: "cmdb-agent",
  prompt: "前回セッションからの変更ファイル（git diff HEAD~1 または state.json の last_session_summary）をもとに、影響を受ける構成アイテムを列挙し、変更影響範囲を報告してください。CI/CD 設定（.github/workflows/）の変更有無も確認してください。"
})
```

結果は次の Development / Verify フェーズに引き渡す（「影響を受ける CI / 依存サービス」として）。

## 停止理由出力（Agent View 可視化）

タスク完了・中断・エラー時は必ず末尾に以下を出力する:

```
[停止理由]
- 状態: 完了 / 中断 / エラー待ち / ブロック
- 理由: <具体的な理由 1行>
- 次アクション: <引き継ぎ先または次ステップ>
```
