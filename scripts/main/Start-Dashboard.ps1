<#
.SYNOPSIS
    ClaudeOS Projects Dashboard を起動する。
.DESCRIPTION
    Node.js で serve-dashboard.js を起動し、ブラウザでダッシュボードを開く。
    Cron 登録済み + GitHub リポジトリ登録済みのプロジェクト進捗を表示する。
    ClaudeOS v9.0
#>

param(
    [int]$Port = 3737,
    [switch]$NoBrowser,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ConfigPath    = Join-Path $ScriptRoot 'config\config.json'
$DashboardJs   = Join-Path $ScriptRoot 'scripts\dashboards\serve-dashboard.js'

if (-not (Test-Path $DashboardJs)) {
    Write-Host "[ERROR] serve-dashboard.js が見つかりません: $DashboardJs" -ForegroundColor Red
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[ERROR] Node.js が見つかりません。インストールしてください。" -ForegroundColor Red
    exit 1
}

# config.json から projectsDir を取得して環境変数に渡す
if (Test-Path $ConfigPath) {
    try {
        $cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.projectsDir) { $env:AI_STARTUP_PROJECTS_DIR = $cfg.projectsDir }
    } catch { $null = $_ }
}

$url = "http://localhost:$Port"

Write-Host ''
Write-Host '======================================' -ForegroundColor Cyan
Write-Host '  ClaudeOS Projects Dashboard' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  URL  : $url" -ForegroundColor White
Write-Host "  Port : $Port" -ForegroundColor DarkGray
Write-Host ''

# Node.js サーバをバックグラウンドで起動
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName               = $node.Source
$psi.Arguments              = "`"$DashboardJs`" $Port"
$psi.UseShellExecute        = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true

$proc = [System.Diagnostics.Process]::Start($psi)

# 起動待ち（最大 5 秒）
$started = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $null = [System.Net.WebClient]::new().DownloadString($url)
        $started = $true
        break
    } catch { $null = $_ }
}

if (-not $started) {
    Write-Host "[WARN] サーバの起動確認がタイムアウトしました。ブラウザで確認してください。" -ForegroundColor Yellow
}

Write-Host "[OK] Dashboard 起動: $url" -ForegroundColor Green

if (-not $NoBrowser) {
    Start-Process $url
    Write-Host "[OK] ブラウザを起動しました" -ForegroundColor Green
}

Write-Host ''
Write-Host "  Enter キーでサーバを停止します..." -ForegroundColor DarkGray
Write-Host ''

if (-not $NonInteractive) {
    Read-Host | Out-Null
}

if (-not $proc.HasExited) {
    $proc.Kill()
    Write-Host "[OK] Dashboard サーバを停止しました。" -ForegroundColor Green
}
