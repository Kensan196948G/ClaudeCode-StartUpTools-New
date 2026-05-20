# Phase 7 — Claude Code 公式機能統合 (CC Features Integration)

**起票日**: 2026-05-20
**起票理由**: Claude Code 2.1.105 → 2.1.145 (約 5 週間) の changelog 評価で、本プロジェクトの自律実行・トークン効率・三層防御を直接強化できる機能が 8 件確認された。うち優先度最上位 3 件を本フェーズで導入する。

> ⚠️ **ナンバリング注意**: `memory/project_phase6_external_integration.md` には Phase 7 候補として 7A-7D (Dashboard/warnings/Weekly/Dreaming curated) が記録されている。
> 本フェーズは「CC 機能統合」軸での **Phase 7-CC** とし、既存の 7A-7D は **Phase 8** に繰り下げる前提で計画する。最終確定はユーザー判断。

---

## 📌 Context

| 観点 | 状態 |
|---|---|
| Claude Code バージョン | 2.1.139+ (Agent View / `/goal` を既採用) |
| Trust Level | 3 / score 0.90 / auto_merge_enabled |
| 本フェーズ 主目的 | 公式機能を「独自実装」から「公式 API」に段階置換し、保守コストを下げつつ三層防御 (CTO 全権委任違反防止) を強化 |
| 完了条件 | 下記 3 項目すべての settings.json/scripts 変更 + 検証完了 + STABLE 連続 N=3 |

---

## 🎯 スコープ (3 項目)

### 項目 A: `MCP alwaysLoad` 適用 (changelog #7 / v2.1.121)

**目的**: 頻用 MCP server (github / memory / context7) を deferred から外し、ToolSearch 経由のオーバーヘッドを削減。

**現状** (`.mcp.json`):
```json
{
  "mcpServers": {
    "github": { "command": "cmd", "args": ["/c","npx","-y","@modelcontextprotocol/server-github"], ... },
    "memory": { ... },
    "sequential-thinking": { ... },
    "context7": { ... }
  }
}
```
→ システム起動時に全 MCP が deferred 状態 (ToolSearch で 1 段噛んでから呼び出し)。

**変更内容**: 各 server に `"alwaysLoad": true` を追加。
```json
"github": { "alwaysLoad": true, "command": "cmd", ... },
"memory": { "alwaysLoad": true, ... },
"context7": { "alwaysLoad": true, ... }
```
※ `sequential-thinking` は使用頻度低のため deferred のまま。

**影響範囲**: `.mcp.json` のみ (1 ファイル)。hooks/agents 無関係。

**ロールバック**: `alwaysLoad: true` を削除するだけ。

**リスク**: 🟢 Low。MCP 仕様の opt-in フィールドのため、未対応 client では無視される。

---

### 項目 B: `settings.autoMode.hard_deny` で禁止事項を hooks → settings 強制化 (changelog #5 / v2.1.136)

**目的**: CLAUDE.md §18 の禁止事項を、現状の hooks (層 3) ではなく settings (層 1) で公式機能として強制。三層防御の層 1 を「公式 API ベース」に格上げ。

**対象禁止事項** (CLAUDE.md §18 から抜粋):
- main 直接 push
- force push (main/master)
- CI 未通過 merge
- CLAUDE.md / settings.json / hooks の自己書き換え
- `--no-verify` 付き git commit
- `git reset --hard` (main against origin)

**変更内容** (`.claude/settings.json`):
```json
{
  "autoMode": {
    "$defaults": true,
    "hard_deny": [
      {
        "pattern": "git push.*\\borigin\\s+main\\b(?!.*--force)",
        "reason": "main 直 push 禁止 (CLAUDE.md §18)"
      },
      {
        "pattern": "git push.*--force.*\\b(main|master)\\b",
        "reason": "force push to main/master 禁止"
      },
      {
        "pattern": "git commit.*--no-verify",
        "reason": "pre-commit hook skip 禁止"
      },
      {
        "pattern": "git reset --hard\\s+origin/(main|master)",
        "reason": "main 履歴の destructive reset 禁止"
      },
      {
        "pattern": "(rm|Remove-Item).*\\.claude.[\\\\/]settings\\.json",
        "reason": "settings.json 削除禁止 (自己書き換え防止)"
      }
    ]
  }
}
```

**影響範囲**: `.claude/settings.json` のみ。既存 hooks (層 3) は残し、層 1+層 3 の二重防御に。

**ロールバック**: `autoMode` ブロックを削除。

**リスク**: 🟡 Medium。
- 既存 cron / agent flows で hard_deny にひっかかる正当な操作が無いか要確認 (特に `git reset --hard` を一時的に使うリベース flow)
- `$defaults: true` の挙動: 公式 built-in ルールと共存する。未指定だと built-in ルール無効化される
- 検証: Phase 7 ブランチで dry-run。実 cron 投入前に手動確認

---

### 項目 C: `claude ultrareview [target]` non-interactive 統合 (changelog #6 / v2.1.120)

**目的**: 従来ユーザートリガー専用だった `/ultrareview` を CLI 化 (v2.1.120)。Verify ループから自律呼び出し可能にし、Trust Level 3 の auto-merge 直前ゲートに組み込む。

**現状**:
- `/ultrareview` は対話セッションでのみ起動可能 (cron 不可)
- CodeRabbit + Codex review は cron でも動くが、multi-agent parallel review は不在

**変更内容**:
1. `scripts/tools/run-ultrareview.js` 新規作成
   - `claude ultrareview --target HEAD` を子プロセスで実行
   - 結果を `reports/ultrareview/YYYY-MM-DD.json` に保存
   - blocker/critical を見つけたら `state.warnings[].kind = "ultrareview_blocker"` に追加
2. `session-end.js` に呼び出し追加 (Verify フェーズ末尾)
   - 条件: Trust Level >= 2 かつ open PR が存在
   - 失敗時: session を block せず warning だけ残す (現行 audit-scan と同じ方式)
3. CLAUDE.md §11 検証ゲートに「Gate-2b: ultrareview (PR 作成前)」を追記

**影響範囲**:
- `scripts/tools/run-ultrareview.js` (新規)
- `.claude/claudeos/scripts/hooks/session-end.js` (呼び出し追加)
- `CLAUDE.md` (§11 ドキュメント追記)
- `reports/ultrareview/` (新規ディレクトリ)

**ロールバック**: session-end.js から呼び出しを削除 + 新規ファイル削除。

**リスク**: 🟡 Medium。
- `claude ultrareview` は課金対象 (multi-agent cloud review)。cron 自動実行はコスト要監視
- 本プロジェクトの `loop-monitor-report.md` を見て、月間呼出回数の上限を `state.json` に設定する (例: 50 回/月)

---

## 🗺️ 実行順序 (PR 分割案)

並列 PR にせず、リスクの低い順に **4 PR シリーズ**で進める。各 PR で STABLE N=3 を待ってから次へ。

| PR | 内容 | 工数目安 | リスク |
|---|---|---|---|
| **PR-7A** | 項目 A (MCP alwaysLoad) — 本プロジェクト適用 | 0.5h | 🟢 Low |
| **PR-7B** | 項目 B (autoMode.hard_deny) — 本プロジェクト適用 | 2-3h (検証込み) | 🟡 Medium |
| **PR-7C** | 項目 C (ultrareview CLI 統合) — 本プロジェクト適用 | 3-5h | 🟡 Medium |
| **PR-7D** | テンプレート配布 + 既存プロジェクト migration | 3-5h | 🟡 Medium |

合計工数: 8.5〜13.5h。**1 セッション 5h では収まらないため、3 セッションに分割**:
- セッション 1: PR-7A + PR-7B (本プロジェクト適用)
- セッション 2: PR-7C (本プロジェクト適用)
- セッション 3: PR-7D (全登録プロジェクトへ伝播)

---

---

## 🌐 項目 D (PR-7D): テンプレート配布 + 既存プロジェクト migration

**目的**: PR-7A〜7C の変更を全登録プロジェクトに伝播させる。

### 調査結果: 配布関数の挙動

| 関数 | 挙動 | Phase 7 で必要 |
|---|---|---|
| `Initialize-ProjectTemplate` | **init-only** (line 142-145 で既存ファイル維持 return) | settings.json / .mcp.json (現状ここ) |
| `Sync-ProjectTemplate` | 差分があれば常に上書き (overwrite-on-diff) | statusline.py / CLAUDE.md (現状ここ) |
| `Sync-ProjectTemplateDirectory` | ディレクトリごとファイル単位 sync | hooks / skills / agents |
| `Sync-ProjectDirectory` | `-Force` 一括コピー | (Phase 7 では未使用) |

**致命的制約**: `.mcp.json` と `.claude/settings.json` は `Initialize-ProjectTemplate` のため、**既存登録プロジェクトには Phase 7 設定が自動配布されない**。

### 変更内容 (4 サブステップ)

#### サブ D-1: テンプレート 4 ファイル更新

| 編集対象 | 反映内容 | 配布関数 |
|---|---|---|
| `scripts/templates/claude-mcp.json` | github/memory/context7 に `"alwaysLoad": true` 追加 (項目 A 伝播) | Initialize (新規プロジェクトのみ) |
| `Claude/templates/claude/settings.json` | `autoMode.hard_deny` 追加 (項目 B 伝播) | Initialize (新規プロジェクトのみ) |
| `Claude/templates/claude/CLAUDE.md` | §11 検証ゲートに「Gate-2b: ultrareview」追記 (項目 C 伝播) | Sync (常時上書き = **既存プロジェクトに即配布**) |
| `Claude/templates/claudeos/scripts/hooks/session-end.js` | ultrareview 呼び出し追加 (項目 C 伝播) | Sync-ProjectTemplateDirectory (既存プロジェクトに即配布) |

#### サブ D-2: ultrareview script 配布パス新設

- 新規ディレクトリ: `Claude/templates/claudeos/scripts/tools/`
- 配置: `run-ultrareview.js`
- `TemplateSyncManager.ps1` の `Sync-LauncherClaudeGlobalConfig` に追加:
  ```powershell
  Sync-ProjectTemplateDirectory `
      -TemplateDir (Join-Path $StartupRoot 'Claude\templates\claudeos\scripts\tools') `
      -TargetDir (Join-Path $ProjectDir '.claude\claudeos\scripts\tools') `
      -Label '.claude/claudeos/scripts/tools'
  ```

#### サブ D-3: 既存プロジェクト用 migration script

新規ファイル: `scripts/setup/migrate-phase7.js`

**機能**:
- 各登録プロジェクトの `.claude/settings.json` と `.mcp.json` を読み取り、差分マージ:
  - `.mcp.json`: github/memory/context7 に `alwaysLoad: true` が無ければ追加
  - `.claude/settings.json`: `autoMode.hard_deny` ブロックが無ければ追加 (既存 `autoMode` は保持)
- `--dry-run` モードで差分プレビュー
- `--apply` で実際に適用
- バックアップ: 適用前に `*.json.bak-phase7` を作成

**実行方法**:
```bash
node scripts/setup/migrate-phase7.js --dry-run     # 全プロジェクト確認
node scripts/setup/migrate-phase7.js --apply       # 全プロジェクトへ適用
node scripts/setup/migrate-phase7.js --apply --project ProjectA  # 個別適用
```

#### サブ D-4: ドキュメント・テスト

- `Claude/templates/claudeos/review-configs/README.md` に Phase 7 マイグレーション手順追記
- `tests/unit/MigratePhase7.Tests.ps1` または `tests/migrate-phase7.test.js` で migration script の冪等性テスト
  - 同じスクリプトを 2 回実行しても結果が変わらないこと
  - 既存 `autoMode` を破壊しないこと
  - バックアップが作成されること

### 影響範囲

- `scripts/templates/claude-mcp.json`
- `Claude/templates/claude/settings.json`
- `Claude/templates/claude/CLAUDE.md`
- `Claude/templates/claudeos/scripts/hooks/session-end.js`
- `Claude/templates/claudeos/scripts/tools/run-ultrareview.js` (新規)
- `scripts/lib/TemplateSyncManager.ps1` (tools 配布行追加)
- `scripts/setup/migrate-phase7.js` (新規)
- `tests/migrate-phase7.test.js` (新規)

### ロールバック

- テンプレート編集 → revert で戻る
- migration script は冪等なので、適用後に元に戻す `--rollback` モードも実装する (`*.json.bak-phase7` から復元)
- TemplateSyncManager の tools 配布行 → revert で戻る

### リスク

🟡 Medium。
- **全登録プロジェクトの settings.json/.mcp.json を変更する**ため、各プロジェクトのカスタマイズと衝突しないか dry-run で必ず確認
- `Sync-ProjectTemplate` で CLAUDE.md を上書きするため、登録プロジェクトが CLAUDE.md を独自カスタマイズしていないか事前確認 (差分が大きいプロジェクトは migration script に「skip」フラグ追加)

---

## ✅ 検証 (各 PR 共通)

### Gate-1 (Verify フェーズ毎回)
- `npm run lint` / `npm run test` / `npm run build` (該当する場合)
- `node scripts/setup/install-review-tools.js` で review tools 状態確認
- 既存 hooks (session-start / session-end / quality-gate / cmdb-scan / audit-scan) が正常起動するか確認

### PR-7A 専用
- Claude Code 起動時に github/memory/context7 MCP が「deferred なし」で即時利用可能か確認
- 既存セッションログで github MCP 呼び出し前に ToolSearch が走っていないことを確認

### PR-7B 専用
- 過去 30 日の cron 実行ログ (`reports/`, audit reports) を grep し、hard_deny パターンにマッチする正当操作が無いことを確認
- ブランチで `git push origin main` を試行 → block されることを確認 (実行はしない、dry-run で確認)
- 各 pattern に対し 1 件以上の test case を追加 (`tests/autoMode-hard-deny.test.js` 想定)

### PR-7C 専用
- `claude ultrareview --target HEAD --background` を手動で 1 回実行し、出力フォーマットを確認
- `reports/ultrareview/` への保存と `state.warnings[]` への記録が動くことを確認
- ❗ コスト確認: 1 回の実行で発生する課金額を `loop-monitor-report.md` に追記

### PR-7D 専用
- `node scripts/setup/migrate-phase7.js --dry-run` で全登録プロジェクトの差分プレビューを確認
- 1 プロジェクト (例: 最も使用頻度の低いもの) を対象に `--apply` を実行し、結果を確認
- バックアップファイル (`*.json.bak-phase7`) が作成されていることを確認
- 同じスクリプトを 2 回実行して冪等性を確認
- CLAUDE.md 配布: テンプレ更新後に登録プロジェクト 1 つを起動し、§11 Gate-2b の追記が反映されているか確認
- session-end.js 配布: ultrareview 呼び出しが各プロジェクトで動作するか確認 (Trust Level 条件分岐含む)

### Gate-2 (PR 作成直前)
- 主要回帰: #1・#22・#31・#51・#71・#111・#131・#141・#231〜#241
- CodeRabbit review committed
- secret scan / axe-core (UI 変更ある場合)

---

## 🔄 ロールバック方針

各 PR は独立した revert で戻せるよう設計する:

- PR-7A: `.mcp.json` の revert のみ
- PR-7B: `.claude/settings.json` の `autoMode` ブロック削除
- PR-7C: `session-end.js` から呼び出し削除 + `scripts/tools/run-ultrareview.js` 削除
- PR-7D: テンプレート revert + `node scripts/setup/migrate-phase7.js --rollback` (全プロジェクトの `*.json.bak-phase7` から復元)

**緊急停止スイッチ**: 各 PR の機能を `state.json` の `feature_flags.{phase7_a,phase7_b,phase7_c,phase7_d_distributed}` で個別に無効化可能にする。

---

## 📊 期待効果

| 指標 | 現状 | Phase 7 完了後 (期待値) |
|---|---|---|
| MCP 呼出オーバーヘッド | ToolSearch 経由で 1 段 | 即時呼出 (推定 100-300ms 削減 / 回) |
| 三層防御層 1 | hooks のみ (層 3 で代替実装) | 公式 settings.autoMode.hard_deny (層 1 公式化) |
| auto-merge 前の品質ゲート | CodeRabbit + Codex | + ultrareview multi-agent |
| Verify ループの自律性 | 8/10 | 9/10 (ultrareview CLI 化で人介在減) |
| **適用範囲** | 本プロジェクトのみ | **全登録プロジェクト** (PR-7D により migration script + テンプレ配布) |

---

## 🧠 関連 memory / docs

- [[project-phase6-external-integration]] — 既存の Phase 7 候補 (7A-7D) が記録されている。本フェーズ完了後に Phase 8 へリネーム
- [[feedback-cto-delegation-three-layer-defense]] — 三層防御の現状。項目 B が層 1 を公式化する
- [[project-phase345-ai-org-maturity]] — Trust Level 3 達成記録。項目 C は Level 3 前提
- `CLAUDE.md §18` — 禁止事項の正本 (項目 B が参照)
- `CLAUDE.md §11` — 検証ゲート (項目 C が追記する)
- `~/.claude/plans/url-oss-https-github-com-gastownhall-be-deep-rabbit.md` — 同時期に評価した beads OSS (不採用)

---

## ⏭️ 次のアクション (本計画書承認後)

1. ユーザーに「既存 Phase 7 (7A-7D) を Phase 8 に繰り下げる」確認を取る
2. PR-7A から着手 (最低リスク・最高速)
3. 各 PR 完了後に `state.warnings` を確認、必要なら計画を補正
