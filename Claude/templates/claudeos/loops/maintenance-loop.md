# Maintenance Loop

## 役割

リリース済みプロジェクトの品質・安定性を守る。
インシデント対応、依存関係管理、定期DevOps、SLA維持を行う。

## このループと判定する条件

- `state.json` の `project.phase_mode` が `"maintenance"` である
- 本番障害・セキュリティアラートへの対応が主作業
- 依存関係の更新・セキュリティスキャンが主作業
- SLA / MTTR の監視・報告が主作業

## 保守サブループ

```
[通常] Monitor → Triage → Improve（軽量）
[インシデント] Monitor → Triage → Fix → Verify → Deploy → Post-mortem
[定期DevOps] Monitor → Dependency-Update → Verify → Deploy
```

## インシデント優先度（Triage 判定基準）

| 優先度 | 条件 | 対応期限 | Agent 起動 |
|---|---|---|---|
| P1 | 本番障害・データ毀損・セキュリティ侵害 | 即時 | Debugger → Developer → QA → DevOps → CTO |
| P2 | 品質劣化・パフォーマンス低下・脆弱性 | 当日〜翌日 | Developer → Reviewer → QA → DevOps |
| P3 | 軽微バグ・依存更新・ドキュメント | 次週 | Developer → QA |

## 定期DevOpsスケジュール

| 頻度 | 作業内容 |
|---|---|
| 週次（月曜） | npm audit / CI health / error rate確認 / Issue triage / Projects更新 |
| 月次（1日） | dependency minor update / security deep scan / KPIレポート生成 |
| 四半期（3/6/9/12月） | major dependency評価 / アーキテクチャ健全性確認 / 人間サインオフ |

## KPI（保守フェーズ）

- SLA稼働率: 99.5% 以上
- MTTR（平均復旧時間）: 4時間以内
- Error Budget残量: 正数を維持

## セッション設定（保守モード）

- 最大セッション時間: 120分（開発モードの 300分 から短縮）
- cron 頻度: 週2〜3回（開発モードは週6回）
- Token配分: monitor 20% / fix 30% / verify 30% / improve 10% / release 10%

## STABLE 判定（保守フェーズ）

以下をすべて満たした場合のみ deploy 許可：

- hotfix test success
- lint success
- security scan: critical/high 0件
- CI success
- 影響範囲レビュー完了（Reviewer または Codex）
- P1 インシデント対応は CTO 最終承認

## 禁止

- 保守セッション中の新機能追加（別ブランチ・別セッションで対応）
- SLA未確認の deploy
- インシデント未解決のまま次の定期DevOpsへ進む
- Post-mortem 未記録の P1 クローズ

## デプロイ完了後の保守登録フロー（移行手順）

開発フェーズからリリース完了時に以下を実行する：

### 自動実行（メニュー [M] ボタン経由）

`scripts/main/Start-MaintenanceMode.ps1` が以下を自動更新する：

```json
{
  "deploy": { "executed_at": "<ISO8601>", "post_deploy_verified": true },
  "maintenance": { "phase_mode": "maintenance", "released_at": "<ISO8601>" },
  "execution": { "phase": "Maintenance" }
}
```

### 移行後の cron 動作変化

| 項目 | 移行前（development）| 移行後（maintenance）|
|---|---|---|
| セッション時間上限 | 300分 | 120分（`maintenance.session_max_minutes`） |
| cron 頻度 | 月〜土（週6回） | 週2〜3回（`maintenance.cron_schedule=weekly`）|
| ループ定義 | `build-loop.md` 等 | 本ファイル（maintenance-loop.md）|
| KPI | CI成功率90% | SLA稼働率99.5% / MTTR4時間 |

### 保守期間

**無期限**。保守フェーズの終了条件は定義しない（プロジェクト廃止時を除く）。

## Output

`reports/.loop-maintenance-report.md`（セッション毎）
`reports/incident-YYYYMMDD-PX.md`（インシデント毎）
`reports/devops-weekly-YYYY-WXX.md`（週次）
`reports/deploy-runbook-YYYYMMDD.md`（デプロイ準備時）
