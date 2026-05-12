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
/goal "<達成条件>。全テスト通過・CI成功・blocker=0・PR作成済み、または stop after 20 turns"

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

```
/goal 達成（Haiku が条件充足を判定）
同一原因エラー 2 回連続 → Issue 化して次タスクへ
修復試行 3 回到達    → Blocked
5 時間到達           → 終了処理
コンテキスト圧迫     → 即終了処理
Token 枯渇           → 安全終了
Security Critical    → 即時対応
```
