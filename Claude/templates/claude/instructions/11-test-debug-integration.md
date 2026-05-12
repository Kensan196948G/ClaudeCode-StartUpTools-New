# 11 — ClaudeCode テスト検証・デバッグ統合指示書

WebUI ベース システム開発用 完全版

---

## 🎯 目的

本プロジェクトにおいて ClaudeCode は以下を実施すること。

- WebUI ベースシステムの品質保証
- 全レイヤー横断テスト
- 自動デバッグ・自動修復
- セキュリティ検査
- パフォーマンス分析
- ログ解析・根本原因分析（RCA）
- 修復後の再検証
- CI/CD 連携
- 自律的品質改善

本指示は以下 5 カテゴリを完全分離して実施すること。

1. フロントエンド
2. バックエンド
3. セキュリティ
4. インフラ
5. データベース

---

## 🧠 基本動作ルール

ClaudeCode は以下を遵守すること。

- 常に日本語で出力
- テスト → 分析 → 修復 → 再テスト の順で動作
- 原因不明エラーを放置しない
- 一時回避ではなく恒久対策を優先
- ログを必ず解析
- 修復後は必ずリグレッションテスト
- CI エラーは最大 5 回まで自動修復（同一原因 2 回で Issue 化 → CLAUDE.md §12 に従う）
- 修復不能時は詳細レポート出力
- 変更内容を必ず記録
- セキュリティを最優先
- パフォーマンス劣化を検知
- state.json に状態保存
- GitHub Actions と連動
- Playwright による E2E を必須化

---

## 📁 テストカテゴリ構成

```text
tests/
├── frontend/
├── backend/
├── security/
├── infrastructure/
└── database/
```

---

## ① フロントエンド テスト検証・デバッグ指示

### 🎨 UI/UX テスト

以下を完全確認すること。

1. レイアウト崩れ
2. レスポンシブ対応
3. Edge / Chrome / Firefox / Safari 互換
4. ダークモード
5. CSS 競合
6. フォント崩れ
7. モーダル表示
8. サイドメニュー動作
9. ツールチップ表示
10. コンポーネント整列

### 🧠 JavaScript 検証

1. API 通信
2. 非同期処理
3. イベント二重実行
4. DOM 更新
5. 状態管理
6. 例外処理
7. Promise 失敗処理
8. Null 耐性
9. LocalStorage 動作
10. SPA ルーティング

### 📂 ファイル処理検証

1. CSV アップロード
2. Excel アップロード
3. PDF 出力
4. ダウンロード
5. 大容量ファイル
6. 不正拡張子拒否
7. MIME タイプ検証
8. ドラッグ＆ドロップ

### ⚡ パフォーマンス検証

1. 初回表示速度
2. 描画速度
3. メモリリーク
4. FPS 低下
5. 不要レンダリング
6. Lazy Load
7. キャッシュ最適化

### 🐞 フロントエンドデバッグ

```bash
Console Error
Network Error
CORS Error
SourceMap
DOM Leak
CSS 競合
WebSocket
```

---

## ② バックエンド テスト検証・デバッグ指示

### 🔧 API 検証

1. GET
2. POST
3. PUT
4. DELETE
5. StatusCode
6. JSON 形式
7. Timeout
8. Retry
9. Exception
10. Validation

### 🔄 業務ロジック検証

1. ワークフロー
2. 承認フロー
3. 状態遷移
4. 排他制御
5. 同時更新
6. データ整合性
7. トランザクション
8. Rollback

### 📩 外部連携検証

1. Microsoft Graph
2. Teams 通知
3. Mail 送信
4. LDAP/AD
5. Entra ID
6. OneDrive
7. SharePoint
8. OAuth
9. Webhook

### ⚡ パフォーマンス検証

1. API 高負荷
2. CPU 使用率
3. メモリ使用量
4. Queue 処理
5. 非同期ジョブ
6. キャッシュ

### 🐞 バックエンドデバッグ

```bash
Server Logs
StackTrace
SQL Logs
Deadlock
Memory Leak
Thread 枯渇
Session 異常
```

---

## ③ セキュリティ テスト検証・デバッグ指示

### 🔐 認証・認可検証

1. MFA
2. JWT
3. Session
4. RBAC
5. Admin 権限
6. Password Policy
7. Token 期限
8. Logout

### 🛡 脆弱性検証

必ず OWASP Top10 を基準に検査。

1. SQL Injection
2. XSS
3. CSRF
4. SSRF
5. Directory Traversal
6. Command Injection
7. File Upload 攻撃
8. Clickjacking
9. Open Redirect
10. XXE

### 🌐 通信セキュリティ

1. HTTPS 強制
2. TLS 確認
3. HSTS
4. Secure Cookie
5. CSP Header
6. CORS 制御

### 📜 ログ・監査

1. 監査ログ
2. 改ざん耐性
3. マスキング
4. SIEM 連携
5. 異常検知

### 🐞 セキュリティデバッグツール

```bash
OWASP ZAP / BurpSuite
npm audit / pip-audit
Dependabot
SAST / DAST
CVE Scan
```

---

## ④ インフラ テスト検証・デバッグ指示

### 🖥 サーバ検証

1. Linux
2. Windows Server
3. systemd
4. Cron
5. Docker
6. Kubernetes
7. VM
8. NTP

### 🌐 ネットワーク検証

1. DNS
2. Ping
3. HTTPS
4. Firewall
5. VPN
6. Proxy
7. LoadBalancer
8. Port 確認

### 💾 ストレージ検証

1. Disk 容量
2. IOPS
3. Backup
4. Restore
5. Snapshot
6. RAID
7. NAS
8. SMB/NFS

### 📈 監視・運用検証

1. CPU 監視
2. Memory 監視
3. Disk 監視
4. Alert 通知
5. Grafana
6. Prometheus
7. Zabbix
8. 自動復旧

### 🐞 インフラデバッグ

```bash
journalctl / dmesg
OOM 確認 / Docker Logs
tcpdump / Wireshark
SSH Logs / Kernel Panic
```

---

## ⑤ データベース テスト検証・デバッグ指示

### 🗄 DB 基本検証

1. CRUD
2. Transaction
3. Commit/Rollback
4. FK 制約
5. Index
6. View
7. Procedure

### ⚡ パフォーマンス検証

1. Slow Query
2. Full Scan
3. Query Plan
4. Lock
5. Deadlock
6. Connection Pool
7. Cache Hit 率

### 🔄 データ整合性検証

1. NULL 制御
2. 型不一致
3. 文字コード
4. 日付型
5. 重複データ
6. Migration
7. Backup/Restore

### 🔐 DB セキュリティ検証

1. 認証
2. 権限制御
3. SQL Injection
4. 暗号化
5. 監査ログ
6. 接続元制限

### 🐞 DB デバッグ

```bash
EXPLAIN / Query Trace
Replication / WAL/Binlog
Buffer 確認 / Fragmentation
Connection Leak
```

---

## 🚀 E2E テスト（Playwright 必須）

Playwright を必須利用すること。

以下を実施。

1. ログイン
2. CRUD
3. 承認フロー
4. CSV アップロード
5. PDF 出力
6. モバイル UI
7. 権限制御
8. エラー画面
9. タイムアウト
10. 多重操作

---

## 🔄 CI/CD 連携指示

GitHub Actions と完全連携。以下を自動実行。

```yaml
Lint
UnitTest
E2E（Playwright）
SecurityScan
Build
DeployCheck
RegressionTest
```

---

## 🧠 自動修復ルール

ClaudeCode は以下を実施。

1. エラー解析
2. 根本原因分析（RCA）
3. 修復
4. 再テスト
5. RegressionTest
6. ログ記録

**上限制御**（CLAUDE.md §12 に従う）:
- CI 自動修復: 最大 5 回
- 同一原因エラー 2 回連続 → Issue 化して次タスクへ
- 修復試行 3 回到達 → Blocked

---

## 📊 レポート出力

必ず以下を出力。

```text
- テスト結果（Pass/Fail 件数）
- 失敗項目（番号・内容）
- 原因分析（RCA）
- 修復内容
- 再発防止策
- セキュリティ影響
- パフォーマンス影響
- 修復成功率
```

---

## 📁 推奨ログ構成

```text
logs/
├── frontend/
├── backend/
├── security/
├── infrastructure/
├── database/
└── ci/
```

---

## 🤖 AI レビュー統合（Codex + CodeRabbit）

詳細手順は `05-codex-debug.md` / `08-operations.md` を参照。
ここでは **テスト実行フローにおける利用方法** のみ記述する。

### 開発フロー統合順序

```text
開発
 ↓
① /coderabbit:review committed --base main   ← 静的解析（高速・広範）
 ↓
② /codex:review --base main --background     ← 設計・ロジック深層レビュー
 ↓
両方の指摘を統合して修正
 ↓
テスト実行（本ファイルの 5 カテゴリ）
 ↓
PR 作成
 ↓
CodeRabbit PR レビュー（自動）
 ↓
Critical/High 0 件 → マージ
```

### AI 役割分担

| AI | テスト連携での役割 |
|---|---|
| ClaudeCode | テスト実行・デバッグ・修復・5カテゴリ検証 |
| Codex | 静的解析・改善提案・設計整合性確認 |
| CodeRabbit | PR 差分レビュー・品質ゲート |

### 品質ゲート（マージ可能条件）

```text
Codex エラー: 0 件
CodeRabbit Critical/High: 0 件
テスト成功率: 100%
セキュリティ検査: PASS
パフォーマンス劣化: なし
```

---

## 🎯 最終目標

ClaudeCode は以下を達成すること。

- 高品質 WebUI
- 自律型デバッグ
- 自動品質改善
- セキュア設計
- 高可用性・高パフォーマンス
- 運用可能品質
- ITSM / ISO27001 / ISO20000 準拠レベル

**「人間がレビュー承認のみを行う品質」を最終目標とする。**
