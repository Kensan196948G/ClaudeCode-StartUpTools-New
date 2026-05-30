# ============================================================
# Start-DeployPrep.ps1 - CTO主導デプロイ準備スクリプト
# state.json の deploy.ready=true を設定し、Runbook を生成する
# 実際のデプロイ実行は人間（ユーザー）が手動で行う
# ============================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$StateFile   = Join-Path $ProjectRoot "state.json"
$ReportsDir  = Join-Path $ProjectRoot "reports"
$TemplateFile = Join-Path $ProjectRoot "Claude\templates\claudeos\docs\deploy-runbook-template.md"

Write-Host ""
Write-Host "  ╔══════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║  🚀 デプロイ準備ウィザード       ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# state.json の読み込み
if (-not (Test-Path $StateFile)) {
    Write-Host "  [ERROR] state.json が見つかりません: $StateFile" -ForegroundColor Red
    exit 1
}
$state = Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json

# STABLE確認
$stableAchieved = $state.stable.stable_achieved
$consecutiveSuccess = $state.stable.consecutive_success
Write-Host "  📊 現在の状態:" -ForegroundColor Cyan
Write-Host "     STABLE達成: $stableAchieved  連続成功: $consecutiveSuccess 回" -ForegroundColor White
Write-Host "     フェーズ: $($state.execution.phase)" -ForegroundColor White
Write-Host "     deploy.ready: $($state.deploy.ready)" -ForegroundColor White
Write-Host ""

if (-not $stableAchieved) {
    Write-Host "  [WARNING] STABLE未達成です。デプロイ準備を続けますか？ (y/N): " -NoNewline -ForegroundColor Yellow
    $confirm = Read-Host
    if ($confirm.ToUpper() -ne "Y") {
        Write-Host "  キャンセルしました。" -ForegroundColor Gray
        exit 0
    }
}

# 対象環境の選択
Write-Host "  デプロイ対象環境を選択してください:" -ForegroundColor Cyan
Write-Host "    1. staging" -ForegroundColor White
Write-Host "    2. production" -ForegroundColor White
Write-Host "  選択 (1/2): " -NoNewline
$envChoice = Read-Host
$environment = switch ($envChoice) { "1" { "staging" } "2" { "production" } default { "staging" } }
Write-Host "  環境: $environment" -ForegroundColor Green
Write-Host ""

# state.json を更新: deploy.ready=true
try {
    $state.deploy.ready = $true
    $state.deploy.environment = $environment
    $state.deploy.pre_deploy_checklist_done = $false
    $state | ConvertTo-Json -Depth 20 | Set-Content $StateFile -Encoding UTF8
    Write-Host "  ✅ state.json 更新: deploy.ready=true, environment=$environment" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] state.json 更新失敗: $_" -ForegroundColor Red
    exit 1
}

# Runbook 生成
$timestamp = Get-Date -Format "yyyyMMdd"
$runbookFile = Join-Path $ReportsDir "deploy-runbook-$timestamp.md"
New-Item -ItemType Directory -Force -Path $ReportsDir | Out-Null

if (Test-Path $TemplateFile) {
    $templateContent = Get-Content $TemplateFile -Raw -Encoding UTF8
    $runbookContent = $templateContent `
        -replace '\{DATE\}', (Get-Date -Format "yyyy-MM-dd") `
        -replace '\{ENVIRONMENT\}', $environment `
        -replace '\{STABLE_STATUS\}', "consecutive_success=$consecutiveSuccess, stable_achieved=$stableAchieved" `
        -replace '\{PROJECT\}', ($state.goal.title ?? "未設定")
    Set-Content $runbookFile -Value $runbookContent -Encoding UTF8
} else {
    # テンプレートがない場合は最小Runbookを生成
    $runbookContent = @"
# デプロイ手順書 — $(Get-Date -Format "yyyy-MM-dd")

## 対象環境: $environment
## プロジェクト: $($state.goal.title)
## STABLE状態: 連続成功 $consecutiveSuccess 回

## Pre-Deploy チェックリスト
- [ ] CI/CD 全ジョブ GREEN 確認
- [ ] security-scan 結果確認（Critical/High 0件）
- [ ] バックアップ取得確認
- [ ] ロールバック手順確認

## デプロイ実行手順（手動）
1. デプロイコマンドを実行（環境依存）
2. ヘルスチェックエンドポイントの確認
3. ログ監視（エラーレートの確認）

## Post-Deploy 検証
- [ ] 主要機能の動作確認
- [ ] エラーレートがベースライン以下であることを確認
- [ ] 監視アラートが発火していないことを確認

## デプロイ完了後の操作（必須）
state.json を以下のように更新してください:
``````json
{
  "deploy": {
    "executed_at": "<実行日時 ISO8601>",
    "executed_by": "<実行者名>",
    "post_deploy_verified": true
  },
  "maintenance": {
    "phase_mode": "maintenance",
    "released_at": "<実行日時 ISO8601>"
  }
}
``````

## ロールバック手順
1. 前バージョンのデプロイを実行
2. ヘルスチェック確認
3. インシデントとして記録
"@
    Set-Content $runbookFile -Value $runbookContent -Encoding UTF8
}

# state.json に runbook_path を記録
try {
    $state.deploy.runbook_generated = $true
    $state.deploy.runbook_path = "reports/deploy-runbook-$timestamp.md"
    $state | ConvertTo-Json -Depth 20 | Set-Content $StateFile -Encoding UTF8
} catch { $null = $_ }

Write-Host "  ✅ Runbook 生成完了: $runbookFile" -ForegroundColor Green
Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  次のステップ:" -ForegroundColor Cyan
Write-Host "  1. $runbookFile を確認する" -ForegroundColor White
Write-Host "  2. Pre-Deploy チェックリストを実行する" -ForegroundColor White
Write-Host "  3. ユーザーが手動でデプロイを実行する" -ForegroundColor Yellow
Write-Host "  4. デプロイ完了後、メニューの [M] で保守モードへ移行する" -ForegroundColor White
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Enterキーでメニューに戻ります"
