# Goal: Production Release

/goal "
■ Goal
本番リリース準備を完成させ、deploy.ready=true を設定して人間サインオフ待ち状態に到達する。

■ Priority
CTO優先順位テーブル (CLAUDE.md §5.1) の優先度4（Release フェーズ最優先タスク）

■ Success Criteria
- STABLE N=5 達成（認証・DB 変更を含むため）
- 全 E2E テスト通過
- セキュリティ最終スキャン Critical/High 0 件
- パフォーマンス劣化なし（ベースラインとの比較）
- Gate-3 チェックリスト全件実行済み
- README・運用手順・ロールバック手順完成
- deploy.ready=true 設定済み
- 人間サインオフ取得待ち状態に到達

■ Scope
対象: リリース判定に必要な品質確認・ドキュメント整備・設定値確認
対象外: 新機能・大規模リファクタ・スキーマ変更
許可操作: バグ修正（最小差分）・ドキュメント更新・設定値修正

■ Forbidden Changes
- 新機能追加
- 大規模リファクタリング
- DB スキーマ変更
- 破壊的 API 変更

■ Execution Strategy
ループ重点: Monitor 10% → Build 20% → Verify 60% → Improve 10%
アプローチ: Verify フェーズに最大リソースを集中。変更は最小差分に限定する。

■ Agent Teams
パターン: B（品質強化）
推奨ロール: ReleaseManager → QA → Security → Reviewer → Audit-Agent → DevOps

■ Validation
ゲート: Gate-2（PR 作成前）+ Gate-3（リリース前・人間サインオフ必須）
必須チェック: 全 E2E + セキュリティ最終スキャン + ロールバック手順確認

■ Evidence Output
- CI 結果 URL（最終 Run URL）
- E2E テスト結果（全件 passed 確認）
- セキュリティスキャン結果（Critical/High = 0 を明示）
- Gate-3 チェックリスト実行証跡
- deploy.ready=true 設定確認（state.json の値）

■ Constraints
- 時間上限: 5時間以内
- 修復試行: 最大3回
- 変更は最小差分のみ

■ Stop Conditions
正常終了:
- リリース条件全達成・deploy.ready=true 設定完了・人間サインオフ待ち状態
異常終了（Failure）:
- Critical 脆弱性検出 → 即停止 + P1 Issue起票
- STABLE N=5 未達で時間切れ → Draft PR + 再開ポイント記録
- or stop after 15 turns
"
