---
name: security
description: 廃止済み。security-reviewer.md に統合済み。
tools: Read
---

> このファイルは廃止されました。`security-reviewer.md` を参照してください。

## 停止理由出力（Agent View 可視化）

タスク完了・中断・エラー時は必ず末尾に以下を出力する:

```
[停止理由]
- 状態: 完了 / 中断 / エラー待ち / ブロック
- 理由: <具体的な理由 1行>
- 次アクション: <引き継ぎ先または次ステップ>
```