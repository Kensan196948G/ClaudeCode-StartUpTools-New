# Goal: MVP Release

/goal "
■ Goal
MVP Release Candidate を完成させ、最小限の動作可能な状態でリリース判定を受ける。

■ Priority
CTO優先順位テーブル (CLAUDE.md §5.1) の優先度4: /goal の Goal 直結 Issue（MVP機能実装）

■ Success Criteria
- 全主要機能動作確認済み
- API 疎通成功
- 認証認可正常動作
- DB CRUD 成功
- CI 成功
- Critical/High 脆弱性ゼロ
- E2E テスト成功
- README / 運用手順完成
- Docker 起動成功（docker-compose.yml がある場合のみ）
- ローカル環境再現可能

■ Scope
対象: MVP に必要な主要機能・API・認証・DB・基本UI
対象外: 過剰なUI改善・Enterprise拡張機能・AI最適化・マイクロサービス分離
許可操作: 機能実装・バグ修正・テスト追加・ドキュメント作成

■ Forbidden Changes
- 過剰なリファクタリング
- 新技術の導入
- アーキテクチャの全面変更
- Enterprise向け機能の追加

■ Execution Strategy
ループ重点: Monitor 15% → Build 40% → Verify 30% → Improve 15%
アプローチ: 動作 → 安定性 → セキュリティ → 保守性 → UI改善 の優先順位で進める。

■ Agent Teams
パターン: A（並列実装）
推奨ロール: CTO → Developer（Backend）+ Developer（Frontend）+ QA

■ Validation
ゲート: Gate-1（Verify毎回）+ Gate-2（PR 作成前）
必須チェック: API 正常系 + 認証フロー + E2E core シナリオ

■ Evidence Output
- CI 結果 URL
- E2E テスト結果（passed/failed 件数）
- セキュリティスキャン結果（Critical/High 件数）
- README 更新コミット URL

■ Constraints
- 時間上限: 5時間以内
- 修復試行: 最大5回（超過時は Blocked + Issue化）
- 過剰リファクタ禁止・新技術導入禁止

■ Stop Conditions
正常終了:
- MVP 完成条件全達成・CI 成功・PR 作成済み
異常終了（Failure）:
- 修復試行5回到達 → Blocked + Issue起票
- Critical 脆弱性未解消 → 停止 + P1 Issue起票
- or stop after 20 turns
"
