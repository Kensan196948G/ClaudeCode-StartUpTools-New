# Claude Code プロジェクト設定（ClaudeOS v9.0）

このファイルはプロジェクト単位の Claude Code 運用ポリシーです（ClaudeOS v9.0 スタータープレート）。
グローバル設定（`~/.claude/CLAUDE.md`）の方針を継承しつつ、プロジェクト固有の設定を定義します。

## 0. 適用範囲

このプロジェクト設定は、リポジトリルートの `.claude/CLAUDE.md` として配置して使用します。
グローバル設定との優先順位は次のとおりです。

- グローバル設定: 全プロジェクト共通の運用方針
- **プロジェクト設定（本ファイル）: プロジェクト固有の方針（グローバルを上書き可）**

## 1. プロジェクト情報

| 項目 | 内容 |
|---|---|
| プロジェクト名 | {プロジェクト名を記入} |
| 目的 | {プロジェクトの目的を記入} |
| 主な利用者 | {利用者を記入} |
| 技術スタック | {使用技術を記入} |
| 準拠規格 | {ISO27001 / ISO20000 / NIST CSF / J-SOX 等} |
| リポジトリ | {URL} |

## 2. 言語と対応

- 日本語で対応・解説する
- コード内コメントは英語可

## 3. Goal 設定（v9.0 — セッション開始時に必ず実行）

```bash
# 状態確認
cat state.json 2>/dev/null || echo "{}"
gh issue list --state open --limit 20

# /goal 設定
/goal "<達成条件>。全テスト通過・CI成功・blocker=0・PR作成済み、または stop after 20 turns"
```

## 4. 運用ループ

CTO は以下の優先順位で動的判断する。`/goal` 未設定時はフォールバックループを使用。

**CTO 優先順位**: Security Critical → CI 失敗 → Blocker → /goal 直結 Issue → 検証不足 → 改善

**フォールバックループ**: `Monitor → Build → Verify → Improve`

| ループ | 時間目安 | 責務 | 禁止事項 |
|---|---|---|---|
| Monitor | 30m | 要件・設計・README 差分確認、Git/CI 状態確認、タスク分解 | 実装・修復 |
| Build | 2h | 設計メモ作成、実装、テスト追加、WorkTree 管理 | ついでの大規模整理、main 直接 push |
| Verify | 1h | test / lint / build / security 確認、STABLE 判定 | 未テストの merge |
| Improve | 1h | 命名整理、リファクタリング、README / docs 更新、再開メモ | 破壊的変更の無断実行 |

優先順位: `Verify > Build > Monitor > Improve`

## 4. STABLE 判定

以下をすべて満たした場合のみ STABLE とします。

- test success
- lint success
- build success
- CI success
- error 0
- security critical issue 0

| 変更規模 | 連続成功回数 | 適用例 |
|---|---|---|
| 小規模 | N=2 | コメント修正・軽微な修正 |
| 通常 | N=3 | 機能追加・バグ修正 |
| 重要 | N=5 | 認証・セキュリティ・DB 変更 |

STABLE 未達は merge / deploy 禁止。

## 5. Git / GitHub ルール

- main 直接 push 禁止
- branch または WorkTree 必須
- PR 必須
- CI 成功のみ merge 許可
- Issue 駆動開発を推奨

### GitHub Projects 状態遷移

`Inbox -> Backlog -> Ready -> Design -> Development -> Verify -> Deploy Gate -> Done / Blocked`

- セッション開始・終了時、各ループ終了時に更新
- 接続不可なら「未接続」または「不明」と明記

### PR 本文の最低限

- 変更内容
- テスト結果
- 影響範囲
- 残課題

## 6. Agent Teams（v9.0）

複雑なタスクでは Agent Teams を状況に応じて自律選択する。

**パターン A**: 並列実装（CTO + Backend + Frontend + テスト）
**パターン B**: 品質強化（CTO + バグ修復 + Security + 回帰テスト）
**パターン C**: 設計検討（CTO + 技術調査 + 設計 + Devil's Advocate）

`claude agents` で Agent View を起動してセッション状態を監視すること。

| 場面 | 判断 |
|---|---|
| 複数機能の並列実装 | ✅ パターン A |
| CI + Security + テスト同時 | ✅ パターン B |
| 1 ファイル修正 / Lint / docs | ❌ Sub-agent で十分 |

## 7. 品質ゲート（CI）

最低限欲しいもの:

- lint
- unit test
- build
- dependency / security scan

CI が未整備なら、未整備であることを先に記録する。

## 8. Auto Repair 制御 / Stop Conditions（v9.0）

```
同一エラー同一原因 2 回 → Issue 化して次タスクへ
修復試行 3 回到達       → Blocked
コンテキスト圧迫警告    → 即終了処理
```

- 修正差分なしで停止
- テスト改善なしで停止

## 9. Token 制御

- 70% 到達: Improvement 停止
- 85% 到達: Verify 優先
- 95% 到達: 安全終了

## 10. Worktree の使いどころ

向いている場面:

- 複数機能を並列で触る
- 比較検証したい
- main 作業を汚したくない

不要な場面:

- 1 ファイルの小修正
- ドキュメント更新のみ

## 11. 5 時間到達時の必須処理

1. 現在の作業内容を整理
2. 最小単位で commit
3. push
4. PR 作成（Draft 可）
5. GitHub Projects Status 更新
6. test / lint / build / CI 結果整理
7. 残課題・再開ポイント整理
8. README.md に終了時サマリーを記載
9. 最終報告出力

## 12. 設計原則

- 要件から逆算する（目的、対象ユーザー、規格制約、受入れ条件を先に固定）
- 要件・設計・実装・検証を切り離さない
- 単一の真実を持つ（主システム、責務、廃止対象を明確化）
- 規格と監査を後付けにしない
- 受入れ基準をテストへ落とす
- README は外向けの真実として扱う

## 13. README 更新基準

以下のいずれかが変わったら README を更新する:

- 利用者が触る機能
- セットアップ手順
- アーキテクチャ
- 品質ゲート

過剰更新は不要。外部説明に耐えない README は放置しない。

## 14. 行動原則

```text
Small change         / Test everything
Stable first         / Deploy safely
Improve continuously / Stop at 5 hours safely
Think within budget  / Use tokens wisely
Document always      / README keeps truth
```

## 15. 参照先

- グローバル設定: `~/.claude/CLAUDE.md`
- 設計原則: `docs/design-principles.md`
- 運用ループ: `docs/operation-loops.md`
- GitHub 連動: `docs/github-integration.md`
- セッションテンプレート: `docs/session-templates.md`
- README テンプレート: `docs/readme-template.md`
