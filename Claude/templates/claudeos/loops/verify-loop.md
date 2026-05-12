# Verify Loop

## 役割

test、lint、build、security 確認、STABLE 判定を行う。

## このループと判定する条件

- test 実行が主作業
- lint 実行が主作業
- build 実行が主作業
- GitHub Actions 結果確認が主作業

## 注意

改善目的で test を回していても、この間は Verify と判定する。

## 必須 SubAgent 起動（v8.2 以降）

Verify フェーズでは **必ず** 以下の SubAgent を Agent ツールで起動すること。
直接 lint / test を実行するだけでは不足。SubAgent による独立観点が STABLE 判定の必要条件。

| 順序 | subagent_type | 役割 | スキップ可否 |
|---|---|---|---|
| 1 | `qa` | 変更近傍テスト、回帰確認、coverage 評価 | **不可** |
| 2 | `security-reviewer` | secrets / 権限 / 入力検証 / OWASP 観点 | **不可** |
| 3 | `e2e-runner` | E2E core テスト、Playwright console error 確認 | UI/API 変更なしのみ可 |
| 4 | `code-reviewer` | 設計・命名・差分品質 | 小規模 fix のみ可 |
| 5 | `audit-agent` | 変更証跡完全性・ISO/J-SOX 規格準拠確認 | PR を伴わない変更なしのみ可 |

### 起動テンプレート

```
Agent({
  description: "QA verify - <変更概要>",
  subagent_type: "qa",
  prompt: "変更ファイル: <files>. 変更近傍のユニットテストを実行し、回帰の有無と coverage を報告。新規追加コードの未検証分岐を列挙。"
})
Agent({
  description: "Security review - <変更概要>",
  subagent_type: "security-reviewer",
  prompt: "<branch> の差分について secrets / SQL / XSS / IDOR / Path Traversal を確認。AI 生成された SQL・正規表現・認可条件は重点的にレビュー。"
})
Agent({
  description: "E2E core - <変更概要>",
  subagent_type: "e2e-runner",
  prompt: "core E2E スイート（#1 / #22 / #31 / #51 / #71 / #111 / #131 / #141 / #231〜#241）を実行し、console error / network failure を報告。"
})
Agent({
  description: "Audit verify - <変更概要>",
  subagent_type: "audit-agent",
  prompt: "今回の変更（PR / commit 履歴）について変更証跡の完全性を確認してください。(1) PR に承認記録・テスト証跡があるか (2) .github/workflows/ の保護ルールが維持されているか (3) secrets/token の保管方式に問題がないか を確認し、[AUDIT-NON-COMPLIANCE] 付きで非準拠を報告してください。"
})
```

### スキップ条件

- `e2e-runner`: docs/README のみの変更で UI/API 経路に触れていない場合
- `code-reviewer`: typo 修正等の trivial fix
- `audit-agent`: PR を伴わない docs/README のみの変更（ただし規格準拠プロジェクトでは必須）

スキップした場合は **理由を終了報告に必ず記載**。記載なきスキップは STABLE 判定の対象外とする。

### Token 制約時

Token 残量 < 25% の場合は qa + security-reviewer のみ必須、他は次セッションへ持ち越して Issue 化する。
