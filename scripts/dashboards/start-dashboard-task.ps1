<#
.SYNOPSIS
    タスクスケジューラーから呼ばれる Dashboard 起動ラッパー。
    二重起動防止・環境変数セット・ログ出力を行う。
#>

$ScriptRoot  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ConfigPath  = Join-Path $ScriptRoot 'config\config.json'
$DashJs      = Join-Path $ScriptRoot 'scripts\dashboards\serve-dashboard.js'
$LogFile     = Join-Path $env:USERPROFILE '.claudeos\dashboard.log'
$Port        = 3737

# ログディレクトリ確保
$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-DashboardLog {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidOverwritingBuiltInCmdlets', '',
        Justification = 'Write-DashboardLog is a local file logging helper; PowerShell 6.1 compatibility module name clash is harmless in this context')]
    param([string]$Msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Write-DashboardLog "=== Dashboard task start ==="

# config.json から projectsDir 取得
if (Test-Path $ConfigPath) {
    try {
        $cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.projectsDir) { $env:AI_STARTUP_PROJECTS_DIR = $cfg.projectsDir }
    } catch { Write-DashboardLog "config.json read error: $_" }
}

Write-DashboardLog "PROJECTS_DIR: $env:AI_STARTUP_PROJECTS_DIR"

# 二重起動防止: ポートが既に使われていれば起動しない
$portInUse = $false
try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
} catch {
    $portInUse = $true
}

if ($portInUse) {
    Write-DashboardLog "Port $Port already in use — dashboard already running. Skip."
    exit 0
}

# node が見つからなければ終了
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-DashboardLog "ERROR: node.exe not found"
    exit 1
}

Write-DashboardLog "Starting: node $DashJs $Port (detached)"

# node を独立プロセスとして起動（PowerShell ウィンドウと切り離す）
# これにより PS ウィンドウが閉じても node は継続稼働する
try {
    $logOut = "${LogFile}.out"
    $proc = Start-Process `
        -FilePath     $node.Source `
        -ArgumentList "`"$DashJs`"", "$Port" `
        -WindowStyle  Hidden `
        -RedirectStandardOutput $logOut `
        -RedirectStandardError  "${LogFile}.err" `
        -PassThru

    if ($proc) {
        Write-DashboardLog "Started: PID=$($proc.Id)  URL=http://localhost:$Port"
    } else {
        Write-DashboardLog "ERROR: Start-Process returned null"
    }
} catch {
    Write-DashboardLog "ERROR: $_"
}

Write-DashboardLog "=== Dashboard task launcher end (node continues in background) ==="
