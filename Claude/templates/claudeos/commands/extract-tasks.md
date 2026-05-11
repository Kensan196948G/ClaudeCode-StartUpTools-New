# /extract-tasks

議事録 / 要件文書 / メール本文などの非構造化テキストから、
実行可能タスクを抽出して Issue 化候補に整形するコマンドです。

## 使い方

```
/extract-tasks docs/meeting-2026-05-11.md
/extract-tasks                                # 直前にユーザが貼ったテキストを処理
```

## 処理フロー

1. 入力テキストを読む（ファイル指定なら Read、無指定なら直前の会話から拾う）
2. `requirements-extractor` skill の手順に従い、決定事項のみを抽出
3. 各タスクを以下の構造で提示:
   - title (Conventional Commits 形式)
   - type / priority
   - acceptance criteria
   - rationale + source quote
4. ユーザに「Issue 起票しますか？（all / 番号指定 / no）」と確認
5. 承諾を得たら `gh issue create` を逐次実行

## 関連

- skill: `requirements-extractor`
- agent: `product-manager` / `architect`（妥当性レビュー）
- Issue Factory: §7 生成条件の人手入力経路として扱う
