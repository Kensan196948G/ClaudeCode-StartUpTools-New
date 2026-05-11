# /changelog

Conventional Commits 形式の git log から CHANGELOG.md / RELEASE_NOTES.md を自動生成するコマンドです。

## 使い方

```bash
# 前回タグから HEAD までを CHANGELOG.md の先頭に追記
node scripts/release/generate-changelog.js

# バージョン明示
node scripts/release/generate-changelog.js --version v3.2.90

# release notes として独立ファイルに出力
node scripts/release/generate-changelog.js --release-notes

# 印字のみ（ファイル変更なし）
node scripts/release/generate-changelog.js --dry
```

## 解析対象 commit type

`feat / fix / perf / refactor / docs / test / build / ci / style / chore / revert`

`!` suffix（例: `feat!:`）は **BREAKING CHANGES** として先頭にまとめる。

## いつ呼ぶか

- PR 作成前: 差分の自動サマリを PR 本文へ
- リリース直前: `git tag` 後に `--release-notes` で RELEASE_NOTES.md を生成
- release-manager agent: タグ打ち前の確認材料として
