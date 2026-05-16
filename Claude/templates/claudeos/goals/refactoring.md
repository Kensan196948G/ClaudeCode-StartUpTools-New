# Goal: Refactoring

/goal "
■ Goal
特定の技術負債を解消し、既存機能を変えずに保守性・可読性を向上させる。

■ Priority
CTO優先順位テーブル (CLAUDE.md §5.1) の優先度6: 改善・リファクタ（余裕がある場合のみ）

■ Success Criteria
- 対象の技術負債を特定・文書化済み
- リファクタリング完了
- 既存テスト全通過（機能変更なし）
- lint success
- CI 成功
- PR 作成済み

■ Scope
対象: 事前に特定した技術負債ファイル・モジュール
対象外: 技術負債と無関係なファイル・機能
許可操作: 命名変更・構造整理・重複排除・コメント改善・型付け強化

■ Forbidden Changes
- 機能追加・機能変更
- API 仕様変更（シグネチャ変更含む）
- DB スキーマ変更
- テストが壊れる変更
- 外部インターフェースの変更

■ Execution Strategy
ループ重点: Monitor 20% → Build 40% → Verify 40% → Improve 0%
アプローチ: 変更前に既存テストを全実行してベースラインを確認。変更後に同じテストを再実行して差分なしを確認する。

■ Agent Teams
パターン: 不使用（単一 Sub-agent で十分）
推奨ロール: Architect → Developer → Reviewer → QA

■ Validation
ゲート: Gate-1（Verify毎回）+ Gate-2（PR 作成前）
必須チェック: 変更前後の全テスト一致確認 + lint + 型チェック

■ Evidence Output
- CI 結果 URL
- テスト結果（before/after の passed 件数が同一であることを示す）
- lint 結果（warning 件数の変化）
- git diff --stat（変更行数の概要）

■ Constraints
- 時間上限: 5時間以内
- 修復試行: 最大3回
- テストが壊れた場合は即ロールバック

■ Stop Conditions
正常終了:
- リファクタリング完了・既存テスト全通過・CI 成功・PR 作成済み
異常終了（Failure）:
- 既存テスト破損が修復不能 → 即ロールバック + Issue起票
- 機能変更が不可避と判明 → 停止 + 別 Issue として分離
- or stop after 20 turns
"
