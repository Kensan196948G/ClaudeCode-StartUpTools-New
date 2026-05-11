# Improve Loop

## 役割

命名改善、技術的負債解消、リファクタリング、文書整備を行う。

## このループと判定する条件

- 実装完了後の整理が主作業
- README や運用文書更新が主作業
- 振る舞いを変えない保守性改善が主作業

## 禁止

- 無断の破壊的変更

## 必須タスク（v8.2 以降）

Improve ループ終了前に以下を必ず実行する。

### 0. Lint --fix 一括適用（v8.2.3 追加）

プロジェクト全体に対し、安全な自動修正を一括適用する。

```bash
node scripts/lint/lint-and-fix.js
```

- 対応 linter: eslint / ruff / golangci-lint（プロジェクト構成から自動検出）
- 適用範囲: `--fix-type suggestion,layout` 相当の安全側のみ
- 結果: `reports/lint-summary.json` に before/after/delta を出力
- quality-gate-check.js が次のセッション開始時にこの JSON を読んで閾値判定

### 1. ダッシュボード再生成

state.json の最新値を反映したダッシュボードを生成する。

```bash
node scripts/dashboards/render.js
```

出力先: `reports/dashboards/*.md`（daily-status / startup-dashboard / system-dashboard / token-status）
テンプレート: `Claude/templates/claudeos/dashboards/*.md`（書き換えない）

### 2. quality_gate / warnings サマリー

`state.warnings[]` を読んで、未対応の `quality_gate_breach` / `verify_subagent_missing` があれば README 末尾または `reports/.loop-improve-report.md` に記載する。

### 3. ループレポート出力

`reports/.loop-improve-report.md` に以下を記録:

- 今ループで実施した改善内容
- 触ったファイル一覧
- 残課題と次セッションへの引き継ぎポイント

## Output

- `reports/.loop-improve-report.md`
- `reports/dashboards/*.md`
