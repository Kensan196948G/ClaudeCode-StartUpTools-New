# Review Tools セットアップガイド (ClaudeOS v8.2.5+)

ClaudeOS 自律開発における **2 段レビュー体制** のセットアップ手順。

| ツール | 役割 | 必須度 |
|---|---|---|
| 🐰 CodeRabbit | 静的解析 40+ ツール + AI コメント / PR 自動レビュー | 必須 |
| 🛡️ Codex (gpt-5.4) | 設計・ロジック・対抗レビュー (deep review) | 推奨 |

両方を組み合わせることで「広範な静的検出 → 深い設計レビュー」の二段カバレッジを実現。

---

## 🐰 CodeRabbit セットアップ

### 1. GitHub App をリポジトリに install (必須)

1. https://github.com/marketplace/coderabbit にアクセス
2. **Install** をクリック
3. インストール先で **All repositories** または対象リポジトリを選択
4. 完了後、PR が作成されると **自動で `coderabbitai[bot]` がレビューコメント**する

確認方法:
```bash
# 既存 PR にレビューが付いているか
gh pr view <PR#> --json reviews --jq '.reviews[] | select(.author.login | contains("coderabbit"))'
```

### 2. ローカル CLI install (推奨)

PR 作成前にローカルで事前レビューしたい場合のみ。

**Windows (PowerShell):**
```powershell
iwr -useb https://cli.coderabbit.ai/install.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | sh
```

認証:
```bash
coderabbit auth login
```

### 3. プロジェクト設定 (.coderabbit.yaml) を配置

各プロジェクトのリポジトリルートに `.coderabbit.yaml` を配置:

```bash
cp Claude/templates/claudeos/review-configs/coderabbit.yaml .coderabbit.yaml
git add .coderabbit.yaml
git commit -m "chore: add CodeRabbit project config"
```

ClaudeOS v8.2.5 のテンプレートには以下が含まれる:
- 重大度ルール (ClaudeOS §8.5 と同期)
- path_filters (lock files / dist / node_modules 除外)
- path_instructions (TypeScript / Python / Go / hooks / release scripts 別)
- ツール統合 (eslint / ruff / semgrep / gitleaks / shellcheck 等 9 種)

### 4. Claude Code スラッシュコマンド (Plugin)

```
/coderabbit:review committed --base main   # コミット済み差分
/coderabbit:review all --base main          # 全変更
/coderabbit:review uncommitted              # 未コミット
```

これらは CLI 経由で動作する。CLI 未 install なら GitHub App のみで運用可。

---

## 🛡️ Codex セットアップ

### 1. CLI install

**npm (推奨)**:
```bash
npm install -g @openai/codex
```

確認:
```bash
codex --version
# codex-cli 0.129.0 以降を推奨
```

### 2. 認証

**ChatGPT アカウント認証 (推奨)**:
```bash
codex login
```

ブラウザが開き、ChatGPT (Plus 以上) でログイン。`~/.codex/auth.json` にトークン保存。

**API キー認証 (代替)**:
```bash
printenv OPENAI_API_KEY | codex login --with-api-key
```

確認:
```bash
codex login status
# Status: Logged in via ChatGPT (email@example.com)
```

### 3. プロジェクト設定 (.codex/config.toml) を配置

各プロジェクトに固有設定を入れる場合:

```bash
mkdir -p .codex
cp Claude/templates/claudeos/review-configs/codex-config.toml .codex/config.toml
echo ".codex/config.toml" >> .gitignore   # 機密設定なら除外
```

テンプレートに含まれるプロファイル:
- `default`: 通常作業 (workspace-write)
- `review`: `/codex:review` (read-only, reasoning_effort=high)
- `adversarial`: `/codex:adversarial-review` (リリース前)
- `rescue`: `/codex:rescue` (debug 深掘り)
- `full_auto`: cron 自律実行 (approval=never)

### 4. Claude Code スラッシュコマンド (Plugin)

```
/codex:setup                          # 初期セットアップ確認
/codex:status                         # 認証 / 設定確認
/codex:review --base main --background      # 通常レビュー
/codex:adversarial-review --base main       # 対抗レビュー (security/auth)
/codex:rescue --background investigate      # debug 深掘り
/codex:result                          # 直近結果取得
/codex:cancel                          # 実行中のレビューを中断
```

### 5. 強化 review gate (リリース直前のみ)

```
/codex:setup --enable-review-gate
```

merge 前に必ず Codex review が成功している必要があるよう gate を設定。

---

## 🚀 自律ループへの組み込み

ClaudeOS v8.2.5 の Verify ループでは以下が標準実行される:

```
1. /coderabbit:review committed --base main   ← 静的解析 + AI コメント (高速・広範)
2. /codex:review --base main --background     ← 設計・ロジックの深いレビュー
3. 両方の指摘を統合し、Critical/High を必須修正
```

リリース前 (DB schema / 認証認可 / 並列処理変更) は以下を追加:

```
4. /codex:adversarial-review --base main      ← 対抗レビュー (最終確認)
```

詳細は CLAUDE.md §8 (Codex 統合) / §8.5 (CodeRabbit 統合) を参照。

---

## 🔍 トラブルシューティング

### CodeRabbit が PR にコメントしない

- GitHub App が install されているか確認: https://github.com/settings/installations
- PR が Draft の場合は `.coderabbit.yaml` の `auto_review.drafts: false` でスキップ中
- base branch が `.coderabbit.yaml` の `auto_review.base_branches` に含まれているか

### `codex review` が認証エラー

```bash
codex logout
codex login
```

### Linux 側 (cron 実行先) で codex / coderabbit が見つからない

`~/.env-claudeos` に PATH を追加:

```bash
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
```

または `cron-launcher.sh` の冒頭で明示的に PATH を export。

### コスト管理

- CodeRabbit: 無料枠 = 月 200 review (Free plan)。超過時は Pro 移行
- Codex: ChatGPT Plus サブスクリプション込み (追加コストなし)

---

## 📊 監視

state.json / agent-transcripts でレビュー実行状況を確認:

```bash
# Codex review 起動履歴
grep -r "codex" reports/agent-transcripts/

# CodeRabbit 指摘の集計
gh pr view <PR#> --json reviews | jq '.reviews[] | select(.author.login | contains("coderabbit")) | .body' | grep -cE "Critical|High"
```
