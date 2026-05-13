## 🚀 完全実装・最終フェーズ指示（全セッション共通）

### /goal テンプレート（MVP Release Candidate 完成版）

以下の形式で `/goal` を設定すること:

```text
/goal "MVP Release Candidate を完成させる。

以下を実施対象とする：
- フロントエンド実装
- バックエンド実装
- データベース実装
- セキュリティ実装
- インフラ構成
- CI/CD構築
- テスト
- ドキュメント整備

以下を完了条件とする：
1. 全主要画面が正常動作
2. API疎通成功
3. 認証認可正常
4. DB CRUD成功
5. CI成功
6. Critical/High脆弱性ゼロ
7. E2Eテスト成功
8. README/運用手順完成
9. Docker起動成功（docker-compose.yml がある場合のみ）
10. ローカル環境で再現可能

以下は今回対象外：
- 過剰なUI改善
- Enterprise拡張機能
- AI最適化
- マイクロサービス分離
- 過剰なリファクタリング

以下の場合は停止する：
- MVP完成
- CI成功
- リリース条件達成
- 修復ループ上限到達"
```

### 必須実行事項

| 項目 | 指示 |
|---|---|
| 🤖 Agent Teams | パターン A（並列実装）・B（品質強化）を最大活用すること |
| ⚡ Auto Mode | 自律開発を実行すること（人間の介入なし） |
| 📊 可視化 | 全プロセス・状況をリアルタイムで可視化すること |
| 📖 ドキュメント | README.md・GitHub Projects を常に最新化すること |
| 🐰 CodeRabbit | 全 PR に必須適用。Critical/High 指摘はマージ前に必ず修正 |
| 🛡️ Codex Review | Development フェーズ後・PR 作成前に必須実行 |
| 🧪 テスト検証 | `11-test-debug-integration.md` の 5 カテゴリを全て実施すること |

### 完了条件

```text
1. 全主要画面が正常動作
2. API疎通成功
3. 認証認可正常
4. DB CRUD成功
5. CI成功
6. Critical/High脆弱性ゼロ
7. E2Eテスト成功
8. README/運用手順完成
9. Docker起動成功（docker-compose.yml がある場合のみ）
10. ローカル環境で再現可能
```

### 停止条件

```text
- MVP完成
- CI成功
- リリース条件達成
- 修復ループ上限到達
```

---

## 🏁 ClaudeOS v9.0 — セッション開始・終了プロトコル

### セッション開始時（必須）

```bash
# 1. 状態確認
cat state.json 2>/dev/null || echo "{}"
gh issue list --state open --limit 20
gh run list --limit 5
gh pr list --state open

# 2. /goal 設定
/goal "MVP Release Candidate を完成させる。完了条件: 全主要画面正常動作・API疎通成功・認証認可正常・DB CRUD成功・CI成功・Critical/High脆弱性ゼロ・E2Eテスト成功・README/運用手順完成・Docker起動成功(docker-compose.ymlがある場合のみ)・ローカル環境再現可能。停止条件: MVP完成・CI成功・リリース条件達成・修復ループ上限到達"

# 3. Agent View 起動
claude agents
```

> **以降、全てを CTO の判断に任せます。CTO 全権委任で自律開発を続けてください。**

- 🎯 `/goal` のゴール条件に向けて CTO が動的判断で最適行動を自律選択する
- ⏱ セッション開始時刻を必ず確認し、5 時間を厳守すること
- 🤖 Agent Teams（パターン A/B/C）を状況に応じて自律 spawn すること
- ⚡ Auto Mode による自律開発を実行すること
- 📋 GitHub Projects・README.md を常に更新すること

**プロジェクト期間は CTO 全権委任で決定（最優先）:**
- 6 か月はデフォルト目安であり、強制制約ではない。CTO 判断で短縮・延長・無期限すべて可
- 実行は Linux Cron（月〜土、1 セッション最大 5 時間）
- CTO が「デプロイ準備完了」と判断したら `deploy.ready=true` を設定し手順書を自動生成する
- 実際のデプロイは人間（ユーザー）が手動で実行。デプロイ完了後は無期限の保守フェーズへ移行

### 自動停止条件

```text
/goal 達成（Haiku が条件充足を判定）
同一原因エラー 2 回連続 → Issue 化して次タスクへ
修復試行 3 回到達    → Blocked
5 時間到達           → 終了処理
コンテキスト圧迫     → 即終了処理
Token 枯渇           → 安全終了
Security Critical    → 即時対応
```
