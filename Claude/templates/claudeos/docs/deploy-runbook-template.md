# デプロイ手順書 — {DATE}

**プロジェクト**: {PROJECT}
**対象環境**: {ENVIRONMENT}
**STABLE状態**: {STABLE_STATUS}
**作成者**: CTO（Claude Code 自動生成）

---

## Pre-Deploy チェックリスト（実行必須）

### CI/CD
- [ ] GitHub Actions CI 全ジョブ GREEN
- [ ] セキュリティスキャン（gitleaks / npm audit）: Critical/High 0件
- [ ] CodeRabbit / Codex レビュー: 未解決指摘 0件（Critical/High）

### STABLE確認
- [ ] `state.json` の `stable.stable_achieved = true`
- [ ] `state.json` の `stable.consecutive_success >= target_n`
- [ ] 最後の Verify フェーズ実行から 24 時間以内

### バックアップ・ロールバック準備
- [ ] データベースバックアップ取得（該当する場合）
- [ ] 現在のデプロイバージョンを記録
- [ ] ロールバック手順を確認（本書の「ロールバック手順」セクション参照）

### 事前通知
- [ ] 関係者への事前通知実施（本番デプロイの場合）
- [ ] メンテナンス時間帯の設定（必要な場合）

---

## デプロイ実行手順

> **重要**: デプロイの実行は必ず人間（ユーザー）が行う。Claude Code は自動実行しない。

### staging 環境

```bash
# 1. 最新コードの確認
git status
git log --oneline -5

# 2. staging デプロイ（プロジェクトに応じて変更）
# npm run deploy:staging
# docker-compose -f docker-compose.staging.yml up -d
# その他プロジェクト固有のデプロイコマンド

# 3. ヘルスチェック
curl -f https://staging.example.com/health || echo "HEALTH CHECK FAILED"
```

### production 環境

```bash
# staging での動作確認後に実施すること

# 1. production デプロイ（プロジェクトに応じて変更）
# npm run deploy:production
# その他プロジェクト固有のデプロイコマンド

# 2. ヘルスチェック
curl -f https://example.com/health || echo "HEALTH CHECK FAILED"
```

---

## Post-Deploy 検証（Gate-3相当）

### 機能確認
- [ ] 主要機能の動作確認（手動）
- [ ] API エンドポイントの疎通確認
- [ ] 認証・認可の動作確認

### モニタリング確認（デプロイ後 30 分間）
- [ ] エラーレートがベースライン以下
- [ ] レスポンスタイムが閾値以内
- [ ] CPU/メモリ使用率が正常範囲
- [ ] 監視アラートが発火していない

### ログ確認
- [ ] アプリケーションログにエラーなし
- [ ] インフラログに異常なし

---

## デプロイ完了後の必須操作

デプロイ・検証完了後、**メニューの [M] ボタン**（保守モードへ移行）を実行する。

または手動で `state.json` を以下のように更新：

```json
{
  "deploy": {
    "executed_at": "<実行日時 ISO8601>",
    "executed_by": "<実行者名>",
    "post_deploy_verified": true
  },
  "maintenance": {
    "phase_mode": "maintenance",
    "released_at": "<実行日時 ISO8601>"
  },
  "execution": {
    "phase": "Maintenance"
  }
}
```

---

## ロールバック手順

問題が発生した場合、以下の手順でロールバックを実施：

```bash
# 1. 直前バージョンに戻す
# git revert <commit> && git push
# または前回リリースタグへのデプロイ

# 2. ヘルスチェック
curl -f https://example.com/health

# 3. インシデント起票（メニューの [I] ボタン）
```

ロールバック後、インシデントとして P1 で記録し Post-mortem を実施する。

---

## 完了記録

| 項目 | 値 |
|---|---|
| デプロイ実行日時 | |
| デプロイ実行者 | |
| デプロイバージョン | |
| 検証完了日時 | |
| 特記事項 | |
