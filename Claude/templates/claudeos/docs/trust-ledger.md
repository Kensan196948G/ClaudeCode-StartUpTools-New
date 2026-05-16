# Trust Ledger — 自律判断範囲の段階的拡大

## 概要

CTO の過去実績（CI成功率・STABLE達成率・ブロッカー発生率）に基づいて
`trust.score` を算出し、スコアに応じて自律判断できる操作範囲を段階的に拡大する。

---

## Trust Level 定義

| Level | スコア条件 | 自律可能な操作 |
|---|---|---|
| **Level 1** | 0.0 〜 0.84 | ファイル編集・テスト実行・Issue起票・Draft PR作成 |
| **Level 2** | 0.85 〜 0.94 | Level 1 の全て + PR作成 + auto_merge（CI全通過時） |
| **Level 3** | 0.95 〜 1.00 | Level 2 の全て + Staging デプロイ |

> 本番デプロイは Level 3 でも人間サインオフ必須（変更不可）

---

## Trust Score 計算式

```
base_score     = ci_success_rate × 0.5
stable_bonus   = (stable_achievements / total_sessions) × 0.3
streak_bonus   = min(ci_success_streak / 10, 1.0) × 0.1
block_penalty  = blocked_events × 0.05（上限 0.2）

trust.score = base_score + stable_bonus + streak_bonus - block_penalty
              ※ 0.0〜1.0 にクランプ
```

---

## 更新タイミング

セッション終了時に以下を `state.json` に書き込む:

```json
{
  "trust": {
    "history": {
      "total_sessions":       +1,
      "successful_sessions":  +1（CI成功時のみ）,
      "ci_success_streak":    +1（CI成功）or 0（CI失敗でリセット）,
      "stable_achievements":  +1（STABLE達成時のみ）,
      "blocked_events":       +1（Blocked発生時のみ）,
      "last_updated":         "ISO8601"
    },
    "score":              再計算値,
    "level":              再判定値（1/2/3）,
    "auto_merge_enabled": score >= 0.85
  }
}
```

---

## Level 昇格・降格ルール

### 昇格条件
- Level 1 → 2: `trust.score >= 0.85` が **2セッション連続**
- Level 2 → 3: `trust.score >= 0.95` が **3セッション連続**

### 降格条件（即時）
- Security Critical 検出 → Level 1 に強制リセット
- 同一エラー同一原因2回連続 → Level を1段階降格
- `blocked_events` が月内に3件超 → Level 1 に降格

---

## CTO の行動ルール

```
セッション開始時:
  1. state.json の trust.level を確認する
  2. 許可操作リスト (trust.permissions.level{N}) に従い行動する
  3. 許可外の操作が必要な場合は Issue起票して人間判断を仰ぐ

セッション終了時:
  1. trust.history を更新する
  2. trust.score を再計算する
  3. trust.level を再判定する
  4. state.json に書き込む
```

---

## 初期値と推奨設定

新規プロジェクト開始時は Level 1 から始めること。
5セッション程度で実績が蓄積され、自然に Level 2 へ昇格する設計。
