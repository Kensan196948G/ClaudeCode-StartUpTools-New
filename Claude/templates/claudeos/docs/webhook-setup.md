# Webhook 通知 セットアップガイド

> ClaudeOS v8.3 — アウトバウンド Webhook 通知
> 対応: Teams / 汎用 HTTPS / Slack（将来）

---

## 通知イベント一覧

| イベント | トリガー | 色 |
|---------|---------|---|
| `stable_achieved` | STABLE 達成（notify-stable.js） | 🟢 緑 |
| `session_end` | セッション終了（session-end.js） | 🔵 青 |
| `ci_blocked` | CI Blocked（notify-stable.js） | 🔴 赤 |
| `dream_complete` | Dreaming 完了（dreaming-runner.js） | 🟣 紫 |

---

## Step 1: state.json に webhook セクションを追加

```json
{
  "webhook": {
    "enabled": true,
    "events": {
      "stable_achieved": true,
      "session_end": true,
      "ci_blocked": true,
      "dream_complete": false
    }
  }
}
```

`enabled: false` のままにしておくと全通知が無効になる（既定）。

---

## Step 2: Teams Incoming Webhook URL の取得

1. Teams で通知を受け取りたいチャンネルを開く
2. チャンネル名の右側「...（その他のオプション）」→「コネクタ」
3. 「Incoming Webhook」→「構成」
4. 名前（例: `ClaudeOS`）とアイコンを設定 → 「作成」
5. 表示された URL をコピーする

> **注意**: Microsoft は 2024年以降、Power Automate Workflows への移行を推奨しています。
> 既存の Incoming Webhook は継続利用可能ですが、新規組織では Teams Admin が
> 有効化している必要があります。

---

## Step 3: 環境変数の設定

URL と シークレットは git に入れず環境変数で管理する。

### Linux / macOS（~/.bashrc または ~/.zshrc に追加）

```bash
export TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."
export HTTPS_WEBHOOK_URL="https://your-server.example.com/webhook"
export HTTPS_WEBHOOK_SECRET="your-signing-secret"  # 任意
export SLACK_WEBHOOK_URL=""  # 将来用（空のままでOK）
```

### Windows（システム環境変数）

```powershell
[System.Environment]::SetEnvironmentVariable("TEAMS_WEBHOOK_URL", "https://...", "User")
[System.Environment]::SetEnvironmentVariable("HTTPS_WEBHOOK_URL", "https://...", "User")
[System.Environment]::SetEnvironmentVariable("HTTPS_WEBHOOK_SECRET", "your-secret", "User")
```

### Linux cron（/etc/cron.d または cronファイルの先頭に追加）

```
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
HTTPS_WEBHOOK_URL=https://your-server.example.com/webhook
HTTPS_WEBHOOK_SECRET=your-signing-secret
```

---

## Step 4: 動作テスト

```bash
# Teams テスト
TEAMS_WEBHOOK_URL="https://..." node .claude/claudeos/scripts/hooks/webhook-notifier.js stable_achieved '{"version":"v3.2.111","pr":265}'

# 汎用 HTTPS テスト
HTTPS_WEBHOOK_URL="https://..." node .claude/claudeos/scripts/hooks/webhook-notifier.js session_end '{}'
```

---

## 汎用 HTTPS エンドポイントの署名検証（受信側実装例）

```javascript
// Node.js Express での受信側実装例
const crypto = require("crypto");

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-claudeos-signature"];
  const secret    = process.env.WEBHOOK_SECRET;

  if (secret && signature) {
    const expected = "sha256=" + crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");
    if (signature !== expected) {
      return res.status(401).send("invalid signature");
    }
  }

  const event = JSON.parse(req.body);
  console.log("ClaudeOS event:", event.event, event.data);
  res.sendStatus(200);
});
```

---

## 汎用 HTTPS ペイロード形式

```json
{
  "event": "stable_achieved",
  "timestamp": "2026-05-07T10:00:00.000Z",
  "source": "claudeos-v8",
  "data": {
    "project": "ClaudeOS v8 自律開発最適化",
    "phase": "Improve",
    "stable_achieved": true,
    "consecutive_success": 5,
    "version": "v3.2.110",
    "pr": 265
  }
}
```

`X-ClaudeOS-Signature` ヘッダー: `sha256=<HMAC-256>` (HTTPS_WEBHOOK_SECRET 設定時のみ)

---

## Teams カード形式

MessageCard 形式（Incoming Webhook 標準）を使用。

```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "00B050",
  "summary": "ClaudeOS: STABLE 達成",
  "sections": [{
    "activityTitle": "✅ ClaudeOS — STABLE 達成",
    "activitySubtitle": "プロジェクト: ClaudeOS v8 自律開発最適化",
    "facts": [
      { "name": "phase", "value": "Improve" },
      { "name": "consecutive_success", "value": "5" }
    ]
  }]
}
```

---

## Slack（将来対応）

`SLACK_WEBHOOK_URL` を設定するだけで自動的に有効化される。
Slack Incoming Webhook URL の取得:
1. https://api.slack.com/apps → Create New App → Incoming Webhooks
2. ワークスペースにインストール → Webhook URL をコピー

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `scripts/hooks/webhook-notifier.js` | 通知コア（Teams / HTTPS / Slack） |
| `scripts/hooks/notify-stable.js` | STABLE / Blocked イベント → webhook 呼び出し |
| `scripts/hooks/session-end.js` | session_end イベント → webhook 呼び出し |
| `scripts/hooks/dreaming-runner.js` | dream_complete イベント → webhook 呼び出し |
