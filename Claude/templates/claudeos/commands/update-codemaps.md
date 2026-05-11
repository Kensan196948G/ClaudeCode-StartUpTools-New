# /update-codemaps

プロジェクトのアーキテクチャ図・依存関係図・ディレクトリ構造・Agent 起動チェーンを
**mermaid 形式** で `docs/architecture/*.md` に自動生成・更新するコマンドです。

## 使い方

```
/update-codemaps                          # 全 codemap 再生成
node scripts/dashboards/render-codemap.js --target deps
node scripts/dashboards/render-codemap.js --target dirs
node scripts/dashboards/render-codemap.js --target agents
node scripts/dashboards/render-codemap.js --dry
```

## 出力

| ファイル | 内容 | 元データ |
|---|---|---|
| `docs/architecture/overview.md` | システム全体図（mermaid `flowchart`） | スクリプト内定数 |
| `docs/architecture/dependencies.md` | パッケージ依存図（mermaid `graph`） | package.json / go.mod |
| `docs/architecture/directory.md` | ディレクトリ構造（mermaid `graph LR`） | `fs.readdirSync` 深さ 2 |
| `docs/architecture/agent-chain.md` | フェーズ別 Agent 起動順序（mermaid `sequenceDiagram`） | CLAUDE.md §6 を反映 |

mermaid ブロックは GitHub / VSCode preview で直接表示可能。

## いつ呼ぶか

- Improve ループ終了前（`render.js` ダッシュボード再生成と並列で）
- 大規模リファクタ後
- リリース前ドキュメント整備
- README から `docs/architecture/overview.md` を参照する場合

## 連携

- 実装: `scripts/dashboards/render-codemap.js`
- agent: `architect` / `doc-updater`
- skill: `autonomous-loops`
