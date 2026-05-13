# Goal: Production Release

/goal "
本番リリース準備を完成させる。

完了条件：
- STABLE N=5 達成（認証・DB 変更を含むため）
- 全 E2E テスト通過
- セキュリティ最終スキャン Critical/High 0 件
- パフォーマンス劣化なし
- Gate-3 チェックリスト全件実行済み
- README・運用手順・ロールバック手順完成
- deploy.ready=true 設定済み
- 人間サインオフ取得待ち状態に到達

制約：
- 新機能追加禁止
- 大規模リファクタ禁止
- schema 変更禁止
- 5時間以内

停止条件：
- リリース条件全達成
- deploy.ready=true 設定完了
- or stop after 15 turns
"
