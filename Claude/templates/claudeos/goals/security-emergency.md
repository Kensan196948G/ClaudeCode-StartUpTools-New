# Goal: Security Emergency

/goal "
■ Goal
Critical セキュリティ脆弱性を即時対応し、本番への影響を最小化する。

■ Priority
CTO優先順位テーブル (CLAUDE.md §5.1) の優先度1: Security Critical 検出（最優先・即時対応）

■ Success Criteria
- 脆弱性の影響範囲特定完了
- 修正完了（最小差分）
- セキュリティスキャン Critical/High 0 件
- 回帰テスト通過
- CI 成功
- Post-mortem 記録済み
- PR 作成済み

■ Scope
対象: 脆弱性が存在するファイル・エンドポイント・依存ライブラリの最小範囲
対象外: 脆弱性と無関係な機能・リファクタ対象
許可操作: 最小差分の脆弱性修正・依存ライブラリ更新・テスト追加

■ Forbidden Changes
- 脆弱性と無関係な箇所の変更
- 新機能追加
- リファクタリング
- 影響範囲外のスキーマ変更

■ Execution Strategy
ループ重点: Monitor 10% → Build 40% → Verify 50% → Improve 0%
アプローチ: 即時 Agent Teams パターン B を起動。影響範囲特定を最初の10分で完了させ、修正に集中する。

■ Agent Teams
パターン: B（品質強化）— 即時起動
推奨ロール: Security → Debugger → Developer → QA → Audit-Agent → DevOps

■ Validation
ゲート: Gate-2（PR 作成前）
必須チェック: セキュリティスキャン（Critical/High = 0 必須）+ 影響範囲の回帰テスト

■ Evidence Output
- セキュリティスキャン結果（修正前後の比較）
- 脆弱性の影響範囲レポート（ファイル・エンドポイント一覧）
- CI 結果 URL
- Post-mortem ドキュメント（内容または URL）
- 修正コミット SHA

■ Constraints
- 時間上限: 初期対応1時間以内・完全解消5時間以内
- 修復試行: 最大3回
- Security Agent を最優先で使用すること

■ Stop Conditions
正常終了:
- 脆弱性解消・セキュリティスキャン Critical/High = 0・CI 成功・PR 作成済み・Post-mortem 完了
異常終了（Failure）:
- 修復試行3回到達 → Blocked + P1 Issue起票 + CTO エスカレーション
- 影響範囲が想定より広大と判明 → 即停止 + 範囲再評価 + Issue化
- or stop after 8 turns
"
