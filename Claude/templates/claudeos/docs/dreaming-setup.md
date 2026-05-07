# Dreaming セットアップガイド

> Anthropic Managed Agents — Dreaming (Research Preview)
> ClaudeOS v8 統合ガイド

## 概要

Dreaming はセッション履歴・Memory を定期レビューし、パターン抽出・記憶整理を自動化する機能。
承認後は `state.dreaming.dreaming_enabled = true` に切り替えるだけで稼働する。

---

## Step 1: アクセスリクエスト申請

**申請フォーム URL:**
```
https://claude.com/form/claude-managed-agents
```

申請時に必要な情報:
- 組織名・用途の説明
- 予定使用量（セッション数 / 頻度）

承認後: `ANTHROPIC_API_KEY` が Dreaming 機能を自動的に利用可能になる。

---

## Step 2: SDK インストール（承認後のみ実施）

```bash
cd .claude/claudeos/scripts/hooks
npm install
```

`package.json` が配置済みのため、このコマンドで `@anthropic-ai/sdk` が自動インストールされる。

## Step 3: 有効化（承認後のみ実施）

`state.json` の `dreaming.dreaming_enabled` を `true` に変更する:

```json
{
  "dreaming": {
    "dreaming_enabled": true,
    "patterns": [],
    "curated_memories": [],
    "recurring_mistakes": [],
    "last_dreaming_run": null
  }
}
```

これだけで次のセッション終了時から自動的に Dreaming が動作する。

---

## 動作フロー

```
セッション終了
  └─ session-end.js (Stop hook)
       ├─ state.json 更新 (last_stop_at)
       └─ dreaming_enabled = true なら dreaming-runner.js を spawn (background)
            ├─ Memory Store 作成 (state.learning をコンテンツとして投入)
            ├─ POST /v1/dreams (model: claude-opus-4-7)
            ├─ ポーリング (最大 20 分)
            ├─ 出力 Memory Store からパターン抽出
            └─ state.dreaming へ書き込み
                 ├─ patterns: 効率的なワークフロー
                 ├─ curated_memories: 次セッション向け知識
                 └─ recurring_mistakes: 繰り返しミス一覧
```

`dreaming-runner.js` は detached プロセスとして起動するため、
Stop hook をブロックせずバックグラウンドで処理される。

---

## 結果の確認

実行後は `state.json` の `dreaming` フィールドを確認:

```bash
node -e "const s=require('./state.json'); console.log(JSON.stringify(s.dreaming, null, 2))"
```

`evacuation-latest.json` にも最新結果が転写される（pre-compact.js が管理）。

---

## エラー対応

| エラー | 原因 | 対処 |
|--------|------|------|
| `Memory Store creation failed: HTTP 403` | アクセス未承認 | Step 1 の申請が必要 |
| `Dream creation failed: HTTP 400` | beta header 不正 | `dreaming-2026-04-21` ヘッダーを確認 |
| `ANTHROPIC_API_KEY not set` | 環境変数未設定 | `.env` または shell profile に設定 |
| `@anthropic-ai/sdk not found` | npm install 未実施 | Step 2 を実行 |
| `Dream ended with status: failed` | タイムアウト / 入力過大 | 過去セッション数を減らして再試行 |

エラーは `state.dreaming.last_error` と `state.dreaming.last_error_at` に記録される。

---

## 技術仕様

| 項目 | 値 |
|------|---|
| API エンドポイント | `POST https://api.anthropic.com/v1/dreams` |
| Beta header | `managed-agents-2026-04-01,dreaming-2026-04-21` |
| 対応モデル | `claude-opus-4-7` / `claude-sonnet-4-6` |
| 最大セッション入力数 | 100 セッション / 1 Dream |
| instructions 最大文字数 | 4,096 文字 |
| ポーリング最大時間 | 20 分（dreaming-runner.js の MAX_POLLS 定数で変更可） |
| npm 依存 | `@anthropic-ai/sdk`（`npm install` で自動インストール） |

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `scripts/hooks/dreaming-runner.js` | Dream 実行・結果取得の本体 |
| `scripts/hooks/session-end.js` | Stop hook — dreaming-runner を spawn |
| `scripts/hooks/pre-compact.js` | /compact 前に dreaming フィールドを evacuation-latest.json へ転写 |
| `system/stable-rubric.json` | STABLE 判定基準（Outcomes 統合） |
| `agents/outcome-grader.md` | Verify フェーズのグレーダーエージェント |
