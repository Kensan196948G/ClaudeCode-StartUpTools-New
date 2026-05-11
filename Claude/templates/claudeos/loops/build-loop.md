# Build Loop

## 役割

設計、実装、修復、WorkTree 管理を行う。

## このループと判定する条件

- コード変更や設定変更が主作業
- 修正のために実際にファイルを編集している

## 禁止

- main への直接 push

## TDD 駆動（v8.2.3 以降）

新規機能・公開 API・バグ修正は **テストファースト** で着手する。実装より先に失敗テストを書く。

### 起動トリガー

| トリガー | アクション |
|---|---|
| 新規ファイル作成（非テスト） | `Skill({skill: "tdd-workflow"})` 起動 |
| state.warnings に `kind: "tdd_required"` | 該当ファイルから `/tdd` 開始 |
| バグ修正 Issue 着手 | 回帰テストを **先に書いてから** 修正 |

### 1 ファイル = 1 テストファイル原則

- `src/foo.ts` → `src/foo.test.ts` または `__tests__/foo.test.ts`
- `app/bar.py` → `tests/test_bar.py`
- `pkg/baz.go` → `pkg/baz_test.go`

検査スクリプト: `.claude/claudeos/scripts/hooks/tdd-coverage-scan.js`
（Stop hook で自動実行。未テスト変更を発見すると state.warnings へ追記）

### 例外（テスト不要扱い）

- `index.js / main.go` 等のエントリポイントのみのファイル
- 設定ファイル（json / yaml / toml）
- ドキュメント / README

これらは `tdd-coverage-scan.js` の EXCLUDE_BASENAMES / 拡張子フィルタで自動除外される。

## Output

`reports/.loop-build-report.md`
