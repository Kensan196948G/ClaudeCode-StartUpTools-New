# Goal: MVP Release

/goal "
MVP Release Candidate を完成させる。

優先順位：
1. 動作
2. 安定性
3. セキュリティ
4. 保守性
5. UI改善

完了条件：
- 全主要機能動作
- API疎通成功
- 認証認可正常
- DB CRUD成功
- CI成功
- Critical/High脆弱性ゼロ
- E2Eテスト成功
- README/運用手順完成
- Docker起動成功（docker-compose.yml がある場合のみ）
- ローカル環境再現可能

対象外：
- 過剰なUI改善
- Enterprise拡張機能
- AI最適化
- マイクロサービス分離
- 過剰なリファクタリング

制約：
- 5時間以内
- 修復ループ最大5回
- 過剰リファクタ禁止
- 新技術導入禁止
- アーキテクチャ全面変更禁止

停止条件：
- MVP完成
- リリース条件達成
- 修復上限到達
- or stop after 20 turns
"
