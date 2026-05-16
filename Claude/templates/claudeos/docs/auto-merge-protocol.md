# Auto Merge Protocol — Trust Level 2 以上での自律マージ

## 概要

`trust.level >= 2` かつ CI 全通過の PR を、CTO が人間の介入なしに自動マージする。

---

## 発動条件

| 条件 | 内容 |
|---|---|
| trust.level | **2 以上**（trust.score >= 0.85） |
| CI | 全チェック通過（`gh pr checks` 全て pass） |
| PR 種別 | 通常の機能追加・バグ修正・ドキュメント更新 |

## 禁止条件（Level 2 でも手動必須）

- 認証・認可の変更
- DB スキーマ変更
- 本番デプロイ
- Security Critical 指摘が残っている PR

---

## CTO の実行手順

```bash
# 1. Trust Level を確認
LEVEL=$(python3 -c "import json; print(json.load(open('.claude/claudeos/data/trust-score.json'))['level'])")
echo "Trust Level: $LEVEL"

# 2. CI 全通過を確認
gh pr checks <PR番号>

# 3. Level 2 以上 + 全通過なら auto-merge を設定
if [ "$LEVEL" -ge 2 ]; then
  gh pr merge <PR番号> --auto --squash
  echo "[AutoMerge] PR #<番号> に auto-merge を設定しました"
fi
```

---

## PowerShell 版（Windows cron 環境）

```powershell
$ts = Get-Content ".claude/claudeos/data/trust-score.json" | ConvertFrom-Json
if ($ts.level -ge 2) {
  gh pr merge $prNumber --auto --squash
  Write-Host "[AutoMerge] Level $($ts.level) → PR #$prNumber auto-merge 設定"
}
```

---

## 注意事項

- `--auto` フラグは「CI 通過後に自動マージ」を設定するもので、即時マージではない
- Trust Level が降格した場合（Security Critical 等）は即座に auto-merge を取り消す:
  ```bash
  gh pr merge <PR番号> --disable-auto
  ```
- 週次で auto-merge の実績を確認し、問題があれば Level 閾値を上げること
