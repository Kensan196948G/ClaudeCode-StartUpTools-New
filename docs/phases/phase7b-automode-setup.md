# Phase 7B — autoMode.hard_deny セットアップ手順

**実装日**: 2026-05-20
**Claude Code バージョン**: 2.1.136+ (`autoMode.hard_deny` 機能)
**配布範囲**: **全プロジェクトに自動適用** (user 設定経由)

## 📌 概要

CLAUDE.md §18 の禁止事項を、Claude Code 公式の `autoMode.hard_deny` 機能で classifier レベル (層 1) で強制する。
現状の hooks (層 3) と組み合わせて、三層防御の **層 1 + 層 3 の二重防御**を実現する。

## ⚠️ 設計上の重要事項 (公式 docs より)

| 項目 | 仕様 |
|---|---|
| 配置場所 | **`~/.claude/settings.json` (user)** または `.claude/settings.local.json` (local) のみ |
| **読まれない場所** | `.claude/settings.json` (shared project settings) ← **重要** |
| フォーマット | **自然言語 (prose) の文字列配列** (regex / オブジェクトではない) |
| `$defaults` | **配列内の文字列**として記述 (`"hard_deny": ["$defaults", ...]`) |
| 出典 | https://code.claude.com/docs/en/settings |

## 🛠 セットアップ手順 (各ユーザー 1 回)

`~/.claude/settings.json` の末尾に以下を追加する:

```json
{
  "autoMode": {
    "hard_deny": [
      "$defaults",
      "main または master ブランチへの直接 git push を実行しない (常に PR 経由でマージする)",
      "main または master ブランチへの force push を実行しない",
      "git commit に --no-verify を付与して pre-commit hook をスキップしない",
      "main ブランチを origin/main に対して git reset --hard で書き換えない",
      "ユーザーの明示的指示なく ~/.claude/CLAUDE.md または .claude/settings.json または .claude/hooks/ を編集しない",
      "CI checks が failing 状態の pull request を merge しない",
      ".claude/ ディレクトリまたは .claude/settings.json を削除しない"
    ]
  }
}
```

## ✅ 検証

```bash
# JSON 構文確認
node -e "JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/settings.json','utf8')); console.log('OK')"
# Windows
node -e "JSON.parse(require('fs').readFileSync(process.env.USERPROFILE + '/.claude/settings.json','utf8')); console.log('OK')"
```

設定が効いているかは、Claude Code セッションで「`git push origin main` を実行して」と依頼し、auto-mode 下で block されることを確認する。

## 🌐 全プロジェクト適用の保証

- `~/.claude/settings.json` は **ユーザレベル設定**のため、対象ユーザーの **すべての Claude セッション (全プロジェクト)** に自動適用される
- migration script 不要 (Phase 7 計画書の PR-7D スコープが軽減される)
- Linux cron 環境では、cron を実行する OS user の `~/.claude/settings.json` を同様に更新する必要がある

## 🔄 ロールバック

```bash
# autoMode ブロックを削除して再保存
# (バックアップが無い場合は手動で削除)
```

## 🔗 関連

- Phase 7 全体計画: `docs/phases/phase7-cc-features-integration.md` (PR-7A 経由でマージ予定)
- CLAUDE.md §18 — 禁止事項の正本
- Claude Code 公式 docs — https://code.claude.com/docs/en/settings
