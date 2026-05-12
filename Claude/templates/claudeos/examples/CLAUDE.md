# Example CLAUDE.md — ClaudeOS v9.0

プロジェクトルートに置く最小構成例（ClaudeOS v9.0 スタータープレート）。
フル仕様は `Claude/templates/claude/CLAUDE.md` を参照。

## セッション開始時

```bash
# 状態確認
cat state.json 2>/dev/null || echo "{}"
gh issue list --state open --limit 20

# /goal 設定
/goal "Issue #XX を実装し、全テスト通過・CI成功・PR作成済み、または stop after 20 turns"
```

## 言語と対応

- 日本語で対応・解説する
- コード内コメントは英語可

## 基本ルール

- `/goal` コマンドでゴールを設定し CTO に全権委任
- `claude agents` で Agent View を起動しセッション監視
- main 直接 push 禁止 / PR 必須 / CI 通過のみ merge 許可
- 同一原因エラー 2 回 → Issue 化して次タスクへ

## STABLE 判定

test + lint + build + CI + security + review がすべて OK で STABLE。
STABLE 未達は merge 禁止。

## 参照先

- フル仕様: `Claude/templates/claude/CLAUDE.md`
- state.json テンプレート: `scripts/setup/state-template.json`
