# Goal: Hotfix

/goal "
■ Goal
本番環境の緊急バグを最小差分で修正する。

■ Priority
CTO優先順位テーブル (CLAUDE.md §5.1) の優先度2: CI 失敗中 / または優先度3: Blocker Issue あり

■ Success Criteria
- バグ再現確認済み
- 最小差分で修正完了
- 修正箇所のテスト追加済み
- CI 成功
- 影響範囲レビュー完了
- PR 作成済み（hotfix/ ブランチ）

■ Scope
対象: バグが発生しているファイル・関数の最小範囲
対象外: バグと無関係なファイル・コンポーネント
許可操作: バグ修正・テスト追加・コメント修正

■ Forbidden Changes
- リファクタリング
- 新機能追加
- バグと無関係な箇所の変更
- スキーマ変更

■ Execution Strategy
ループ重点: Monitor 20% → Build 50% → Verify 30% → Improve 0%
アプローチ: 最小差分修正を最優先。広範囲な調査よりも症状を絞り込んでから修正する。

■ Agent Teams
パターン: B（品質強化）
推奨ロール: Debugger → Developer → QA → DevOps

■ Validation
ゲート: Gate-2（PR 作成前）
必須チェック: 修正箇所の単体テスト + 影響ファイル近傍の回帰テスト

■ Evidence Output
- CI 結果 URL（GitHub Actions Run URL）
- 修正コミット SHA
- 影響ファイル一覧（git diff --stat 出力）
- テスト結果（passed/failed 件数）

■ Constraints
- 時間上限: 2時間以内
- 修復試行: 最大3回（超過時は Blocked + Issue化）
- 同一エラー同一原因2回連続で即 Blocked

■ Stop Conditions
正常終了:
- バグ修正完了・テスト追加済み・CI 成功・PR 作成済み
異常終了（Failure）:
- 修復試行3回到達 → Blocked + Issue起票 + 次タスクへ
- 同一エラー同一原因2回連続 → 即停止 + Issue化
- or stop after 10 turns
"
