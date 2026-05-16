# Agent Communication Protocol — GitHub Issues メッセージバス

## 概要

複数の Claude Code セッション（Agent）が独立して並列動作する際、
GitHub Issues を唯一の共有通信チャネルとして使用する。
エージェント同士が直接通信せず、Issues/Comments を介して非同期協調する。

---

## メッセージ構造

### Issue タイトル形式

```
[AGENT-MSG] {送信元ロール} → {宛先ロール} | {件名}

例:
[AGENT-MSG] CTO → Developer | Issue #42 の実装を依頼
[AGENT-MSG] QA → CTO | テスト失敗を報告
[AGENT-MSG] Security → ALL | Critical 脆弱性を検出
```

### Issue ラベル

| ラベル | 意味 |
|---|---|
| `agent-msg` | エージェント間メッセージ（必須） |
| `agent:cto` | CTO からのメッセージ |
| `agent:developer` | Developer からのメッセージ |
| `agent:qa` | QA からのメッセージ |
| `agent:security` | Security からのメッセージ |
| `agent:devops` | DevOps からのメッセージ |
| `priority:urgent` | 即時対応必須（Security Critical 等） |
| `status:open` | 未処理 |
| `status:in-progress` | 処理中 |
| `status:done` | 完了 |

### Issue 本文テンプレート

```markdown
## Agent Message

**From:** {送信元ロール}
**To:** {宛先ロール または ALL}
**Session:** {セッション開始時刻 ISO8601}
**Priority:** {urgent / normal / low}

## 内容

{メッセージ本文}

## 期待するアクション

- [ ] {宛先エージェントに期待するアクション1}
- [ ] {宛先エージェントに期待するアクション2}

## 関連リソース

- Issue: #{関連Issue番号}
- PR: #{関連PR番号}
- state.json snapshot: {key値のスナップショット}
```

---

## プロトコルルール

### 送信ルール
1. `agent-msg` ラベルを必ず付ける
2. タイトルは `[AGENT-MSG]` で始める
3. 宛先が特定のロールなら対応するラベルを付ける
4. 全エージェントへの緊急通知は `priority:urgent` + `agent:ALL` を使う

### 受信・処理ルール
1. セッション開始時に以下を確認する:
   ```bash
   gh issue list --label "agent-msg,status:open" --limit 10
   ```
2. 自分宛て（または ALL 宛て）のメッセージを優先処理する
3. 処理開始時に `status:in-progress` ラベルへ変更する
4. 処理完了時に `status:done` ラベルへ変更し、結果をコメントする

### Security Critical の特別ルール
```bash
# Security Agent が検出した場合は即時全員通知
gh issue create \
  --title "[AGENT-MSG] Security → ALL | 🚨 Critical 脆弱性検出" \
  --label "agent-msg,agent:security,priority:urgent,status:open" \
  --body "..."
```
全エージェントはこのメッセージを最優先で処理し、現在の作業を中断する。

---

## 並列セッション管理

### cron での並列起動例

```bash
# プロジェクトA: CTO セッション（実装担当）
claude -p "$(cat ~/.claudeos/roles/cto-build.md)" --project ProjectA &

# プロジェクトA: QA セッション（テスト監視担当）
claude -p "$(cat ~/.claudeos/roles/qa-monitor.md)" --project ProjectA &

# エージェント間の調整は GitHub Issues 経由で行う
```

### デッドロック防止ルール
- 同一ファイルへの同時書き込みは Git conflict で検出できるため、
  PR の conflict を確認してから merge すること
- 同一 Issue への同時クローズは禁止（先着優先・後着はコメントのみ）

---

## 実装ステータス

| 機能 | 状態 |
|---|---|
| Issue テンプレート | ✅ `.github/ISSUE_TEMPLATE/agent-message.md` |
| ラベル定義 | 手動で GitHub に追加が必要 |
| 並列 cron 起動 | `Start-ClaudeCode.ps1` 拡張で対応予定 |
