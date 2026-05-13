# Goal: Security Emergency

/goal "
Critical セキュリティ脆弱性を即時対応する。

完了条件：
- 脆弱性の影響範囲特定完了
- 修正完了（最小差分）
- セキュリティスキャン Critical/High 0 件
- 回帰テスト通過
- CI成功
- Post-mortem 記録済み
- PR作成済み

制約：
- Agent Teams パターン B を即時起動
- Security Agent を最優先で使用
- 影響範囲外は一切触らない
- 1時間以内に初期対応完了

停止条件：
- 脆弱性解消・CI成功
- or stop after 8 turns
"
