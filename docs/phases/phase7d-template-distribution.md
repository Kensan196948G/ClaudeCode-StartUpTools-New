# Phase 7D — テンプレート配布 + migration script

**実装日**: 2026-05-20
**配布範囲**: 全登録プロジェクト
**先行 PR**: PR-7A (#290) / PR-7B (#291) / PR-7C (#292)

## 📌 概要

PR-7A〜7C の Phase 7 機能を全登録プロジェクトに伝播させる。

| 項目 | 配布方式 | 既存プロジェクト |
|---|---|---|
| 項目 A (MCP alwaysLoad) | テンプレ更新 + migration script | **migration script で適用** |
| 項目 B (autoMode.hard_deny) | user settings | **既に全プロジェクト自動適用** (PR-7B 完了時点) |
| 項目 C (run-ultrareview.js) | テンプレ Sync (overwrite-on-diff) | **launcher 起動時に自動配布** |
| 項目 C (CLAUDE.md §11 Gate-2b) | テンプレ Sync | **launcher 起動時に自動配布** |

## 🛠 変更内容

### サブ D-1: テンプレート 3 ファイル更新

- `scripts/templates/claude-mcp.json` — 各 server に `alwaysLoad: true` 追加 (項目 A)
- `Claude/templates/claude/CLAUDE.md` — §11 に Gate-2b ultrareview 追記 (項目 C)
- `Claude/templates/claudeos/scripts/tools/run-ultrareview.js` — 新規 (項目 C を配布)

> **項目 B は user settings 専用のためテンプレ対象外** (PR-7B で完了)

### サブ D-2: TemplateSyncManager.ps1 更新

新規 `Sync-ProjectTemplateDirectory` 呼び出しを `Sync-LauncherClaudeGlobalConfig` に追加:

```powershell
Sync-ProjectTemplateDirectory `
    -TemplateDir (Join-Path $StartupRoot 'Claude\templates\claudeos\scripts\tools') `
    -TargetDir (Join-Path $ProjectDir 'scripts\tools') `
    -Label 'scripts/tools'
```

これにより `scripts/tools/run-ultrareview.js` が次回 launcher 起動時に各プロジェクトへ配布される。

### サブ D-3: migration script (`scripts/setup/migrate-phase7.js`)

**機能**:
- 各登録プロジェクトの `.mcp.json` を読み取り、`github` / `memory` / `context7` に `alwaysLoad: true` を差分マージ
- 冪等 (何度実行しても結果同じ)、既存カスタマイズ保持、バックアップ作成 (`*.bak-phase7`)

**プロジェクト discovery 戦略**:
1. `config/config.json` の `projectsDir` を取得
2. `recent-projects.json` から登録プロジェクト名を取り、`projectsDir + name` を確認
3. (fallback) `projectsDir` 直下を scan して `.mcp.json` を持つディレクトリを追加

**使い方**:
```bash
node scripts/setup/migrate-phase7.js --dry-run                # 全プロジェクト差分プレビュー
node scripts/setup/migrate-phase7.js --apply                  # 全プロジェクトへ適用
node scripts/setup/migrate-phase7.js --apply --project NAME   # 個別適用
node scripts/setup/migrate-phase7.js --rollback               # *.bak-phase7 から復元
```

## ⚠️ 制約 (Linux 側プロジェクト)

本 script は **ローカルファイルアクセスのみ**。SSH モードで `/home/kensan/Projects/` に存在する
Linux 側プロジェクトには直接適用できない。

### Linux 側プロジェクトへの適用方法

```bash
# Linux 側で本リポジトリを clone してから:
ssh kensan@linux-host
cd /home/kensan/Projects/ClaudeCode-StartUpTools-New
git pull
node scripts/setup/migrate-phase7.js --dry-run
node scripts/setup/migrate-phase7.js --apply
```

または個別プロジェクトに対して:
```bash
# 単一プロジェクトに limited apply
node scripts/setup/migrate-phase7.js --apply --project Civil-Draw
```

## ✅ 検証

### 本セッションで実施済み
- [x] `migrate-phase7.js --dry-run` で Windows ローカル 4 プロジェクト検出 (AEGIS-SIGHT 等)
- [x] 各プロジェクト 3 server の変更 (`github` / `memory` / `context7`) 予定確認
- [x] テンプレ JSON / CLAUDE.md / ps1 構文確認

### 本 PR merge 後にユーザが実施
- [ ] `node scripts/setup/migrate-phase7.js --apply` (Windows 側)
- [ ] Linux 側に git pull → 同様に apply
- [ ] 翌セッション以降、各プロジェクトで MCP が即時利用可能か確認
- [ ] (任意) ローカル統合テスト: 1 プロジェクトで実 migration → rollback → 再 migration の冪等確認

## 🔄 ロールバック

- テンプレ更新: revert で戻る
- TemplateSyncManager.ps1: revert で戻る
- 各プロジェクトの .mcp.json: `node scripts/setup/migrate-phase7.js --rollback` で `*.bak-phase7` から復元

## 🌐 全プロジェクト適用の最終状態

| Phase 7 項目 | 既存プロジェクトへの適用方法 |
|---|---|
| 項目 A (MCP alwaysLoad) | `node scripts/setup/migrate-phase7.js --apply` (Windows + Linux 各々) |
| 項目 B (autoMode.hard_deny) | `~/.claude/settings.json` に手動追記 (`docs/phases/phase7b-automode-setup.md` 参照) |
| 項目 C (run-ultrareview.js) | 次回 launcher 起動時に自動配布 |
| 項目 C (CLAUDE.md §11 Gate-2b) | 次回 launcher 起動時に自動配布 |

## 🔗 関連

- Phase 7 全体計画: `docs/phases/phase7-cc-features-integration.md` (PR-7A 経由)
- PR-7B 手順書: `docs/phases/phase7b-automode-setup.md` (PR-7B 経由)
- PR-7C script: `scripts/tools/run-ultrareview.js` (PR-7C 経由)
