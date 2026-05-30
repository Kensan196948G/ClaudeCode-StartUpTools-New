# ============================================================
# Start-MaintenanceMode.ps1 - 保守モード移行スクリプト
# デプロイ完了後に state.json を保守フェーズへ更新する
# ============================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$StateFile   = Join-Path $ProjectRoot "state.json"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor DarkCyan
Write-Host "  ║  🔄 保守モード移行ウィザード         ║" -ForegroundColor DarkCyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor DarkCyan
Write-Host ""

if (-not (Test-Path $StateFile)) {
    Write-Host "  [ERROR] state.json が見つかりません" -ForegroundColor Red
    exit 1
}
$state = Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json

# 現在の状態確認
Write-Host "  📊 移行前の状態:" -ForegroundColor Cyan
Write-Host "     phase_mode: $($state.maintenance.phase_mode)" -ForegroundColor White
Write-Host "     deploy.ready: $($state.deploy.ready)" -ForegroundColor White
Write-Host "     deploy.runbook_generated: $($state.deploy.runbook_generated)" -ForegroundColor White
Write-Host ""

if (-not $state.deploy.ready) {
    Write-Host "  [WARNING] deploy.ready=false です。デプロイ準備（D）を先に実行してください。" -ForegroundColor Yellow
    Write-Host "  このまま続けますか？ (y/N): " -NoNewline
    $confirm = Read-Host
    if ($confirm.ToUpper() -ne "Y") {
        Write-Host "  キャンセルしました。" -ForegroundColor Gray
        exit 0
    }
}

# デプロイ実行者と日時の入力
Write-Host "  デプロイ実行者名を入力してください: " -NoNewline -ForegroundColor Cyan
$executedBy = Read-Host
if ([string]::IsNullOrWhiteSpace($executedBy)) { $executedBy = "unknown" }

$now = (Get-Date).ToUniversalTime().ToString("o")

# state.json を保守モードへ更新
try {
    $state.deploy.executed_at = $now
    $state.deploy.executed_by = $executedBy
    $state.deploy.post_deploy_verified = $true
    $state.maintenance.phase_mode = "maintenance"
    $state.maintenance.released_at = $now
    $state.execution.phase = "Maintenance"

    $state | ConvertTo-Json -Depth 20 | Set-Content $StateFile -Encoding UTF8

    Write-Host ""
    Write-Host "  ✅ 保守モードへの移行が完了しました！" -ForegroundColor Green
    Write-Host ""
    Write-Host "  更新内容:" -ForegroundColor Cyan
    Write-Host "    maintenance.phase_mode = maintenance" -ForegroundColor White
    Write-Host "    maintenance.released_at = $now" -ForegroundColor White
    Write-Host "    deploy.executed_at = $now" -ForegroundColor White
    Write-Host "    deploy.executed_by = $executedBy" -ForegroundColor White
    Write-Host "    execution.phase = Maintenance" -ForegroundColor White
    Write-Host ""
    Write-Host "  次回の cron セッションから保守モード（120分・週次）で自動稼働します。" -ForegroundColor DarkCyan
} catch {
    Write-Host "  [ERROR] state.json 更新失敗: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Read-Host "  Enterキーでメニューに戻ります"
