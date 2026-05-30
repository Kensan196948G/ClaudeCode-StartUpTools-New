# ============================================================
# Start-Menu.ps1 - AI CLI 統合メニュー
# ClaudeOS Agent Teams 対応: Agent Orchestrator / Scrum Master の操作入口
# docs/common/08_AgentTeams対応表.md を参照
# ============================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Import-Module (Join-Path $ProjectRoot "scripts\lib\LauncherCommon.psm1") -Force -DisableNameChecking
Import-Module (Join-Path $ProjectRoot "scripts\lib\Config.psm1") -Force
Import-Module (Join-Path $ProjectRoot "scripts\lib\MenuCommon.psm1") -Force -DisableNameChecking

if ($env:AI_STARTUP_MENU_TEST_EXPORT -ne '1') {
    Set-Location $ProjectRoot

    $ConfigPath = Get-StartupConfigPath -StartupRoot $ProjectRoot
    $Config = Import-LauncherConfig -ConfigPath $ConfigPath
    $LinuxHost = if ($Config.linuxHost) { $Config.linuxHost } else { "未設定" }
    $LinuxBase = if ($Config.linuxBase) { $Config.linuxBase } else { "未設定" }
    $LocalDir  = if ($Config.projectsDir) { $Config.projectsDir } else { "未設定" }
    $ShellExe = Get-LauncherShell
}

function Get-RecentProjectSortWeight {
    param([object]$Entry)

    switch ($Entry.result) {
        'success' { return 3 }
        'unknown' { return 2 }
        'cancelled' { return 1 }
        'failure' { return 0 }
        default { return 2 }
    }
}

function Get-RecentProjectSuccessRate {
    param([object]$Entry)

    $matchingEntries = @(
        Get-RecentProject -HistoryPath $Config.recentProjects.historyFile |
            Where-Object {
                $_.project -eq $Entry.project -and
                $_.tool -eq $Entry.tool -and
                $_.mode -eq $Entry.mode
            }
    )
    return (Get-LauncherRecentSummary -Entries $matchingEntries).SuccessRate
}

function Get-SortedRecentProject {
    param(
        [object[]]$Entries,
        [ValidateSet('success', 'timestamp', 'elapsed')]
        [string]$SortMode = 'success'
    )

    switch ($SortMode) {
        'timestamp' {
            return @(
                $Entries |
                    Sort-Object @{ Expression = {
                        if ($_.timestamp) { try { [datetimeoffset]$_.timestamp } catch { [datetimeoffset]::MinValue } }
                        else { [datetimeoffset]::MinValue }
                    }; Descending = $true }
            )
        }
        'elapsed' {
            return @(
                $Entries |
                    Sort-Object `
                        @{ Expression = {
                            if ($null -ne $_.elapsedMs) { [int]$_.elapsedMs } else { [int]::MaxValue }
                        }; Descending = $false }, `
                        @{ Expression = { Get-RecentProjectSortWeight -Entry $_ }; Descending = $true }, `
                        @{ Expression = {
                            if ($_.timestamp) { try { [datetimeoffset]$_.timestamp } catch { [datetimeoffset]::MinValue } }
                            else { [datetimeoffset]::MinValue }
                        }; Descending = $true }
            )
        }
    }

    return @(
        $Entries |
            Sort-Object `
                @{ Expression = { Get-RecentProjectSuccessRate -Entry $_ }; Descending = $true }, `
                @{ Expression = { Get-RecentProjectSortWeight -Entry $_ }; Descending = $true }, `
                @{ Expression = {
                    if ($_.timestamp) { try { [datetimeoffset]$_.timestamp } catch { [datetimeoffset]::MinValue } }
                    else { [datetimeoffset]::MinValue }
                }; Descending = $true }
    )
}

function Get-FilteredRecentProject {
    param(
        [object[]]$Entries,
        [string]$ToolFilter = '',
        [string]$SearchQuery = '',
        [ValidateSet('success', 'timestamp', 'elapsed')]
        [string]$SortMode = 'success'
    )

    $filtered = @($Entries)
    if (-not [string]::IsNullOrWhiteSpace($ToolFilter)) {
        $filtered = @($filtered | Where-Object { $_.tool -eq $ToolFilter })
    }
    if (-not [string]::IsNullOrWhiteSpace($SearchQuery)) {
        $filtered = @($filtered | Where-Object { $_.project -like "*$SearchQuery*" })
    }
    return @(@(Get-SortedRecentProject -Entries $filtered -SortMode $SortMode))
}

function Get-RecentProjectLabel {
    param([Parameter(Mandatory)][object]$Entry)

    $tool = if ([string]::IsNullOrWhiteSpace($Entry.tool)) { $Config.tools.defaultTool } else { $Entry.tool }
    $mode = if ($Entry.mode -eq 'local') { 'Local' } else { 'SSH' }
    $timestamp = if ($Entry.timestamp) {
        try { (Get-Date $Entry.timestamp).ToString('yyyy-MM-dd HH:mm') } catch { $Entry.timestamp }
    }
    else {
        '時刻不明'
    }

    $result = switch ($Entry.result) {
        'success' { 'OK' }
        'failure' { 'FAIL' }
        'cancelled' { 'CANCEL' }
        default { 'UNKNOWN' }
    }

    $elapsed = if ($null -ne $Entry.elapsedMs) { "{0}ms" -f [int]$Entry.elapsedMs } else { 'n/a' }
    $matchingEntries = @(
        Get-RecentProject -HistoryPath $Config.recentProjects.historyFile |
            Where-Object {
                $_.project -eq $Entry.project -and
                $_.tool -eq $Entry.tool -and
                $_.mode -eq $Entry.mode
            }
    )
    $summary = Get-LauncherRecentSummary -Entries $matchingEntries
    $successRate = if ($summary.Total -gt 0) { "$($summary.SuccessRate)%" } else { 'n/a' }

    return "{0} [{1}/{2}/{3}] ({4}, {5}, success {6})" -f $Entry.project, $tool, $mode, $result, $timestamp, $elapsed, $successRate
}

function Get-RecentProjectColor {
    param([Parameter(Mandatory)][object]$Entry)

    switch ($Entry.result) {
        'success' { return 'Green' }
        'failure' { return 'Red' }
        'cancelled' { return 'Yellow' }
        default { return 'Cyan' }
    }
}

function Get-RecentProjectLaunchSpec {
    param([Parameter(Mandatory)][object]$Entry)

    $tool = if ([string]::IsNullOrWhiteSpace($Entry.tool)) { $Config.tools.defaultTool } else { $Entry.tool }
    $modeIsLocal = ($Entry.mode -eq 'local')
    $scriptMap = @{
        'claude' = "scripts\main\Start-ClaudeCode.ps1"
        'codex' = "scripts\main\Start-CodexCLI.ps1"
        'copilot' = "scripts\main\Start-CopilotCLI.ps1"
    }

    $scriptArgs = @("-Project", $Entry.project)
    if ($modeIsLocal) {
        $scriptArgs += "-Local"
    }

    return [pscustomobject]@{
        tool = $tool
        file = $scriptMap[$tool]
        scriptArgs = $scriptArgs
    }
}

function Get-ProjectPhaseMode {
    # state.json からフェーズ・デプロイ状態を読み取る（失敗時は development を返す）
    try {
        $stateFile = Join-Path $ProjectRoot "state.json"
        if (Test-Path $stateFile) {
            $state = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
            $mode = if ($state.maintenance.phase_mode) { $state.maintenance.phase_mode } else { "development" }
            $deployReady = if ($null -ne $state.deploy.ready) { $state.deploy.ready } else { $false }
            return [pscustomobject]@{ Mode = $mode; DeployReady = $deployReady }
        }
    } catch { $null = $_ }
    return [pscustomobject]@{ Mode = "development"; DeployReady = $false }
}

function Show-Menu {
    Clear-Host
    $hr = "  " + ("─" * 52)

    $phaseInfo = Get-ProjectPhaseMode
    $isMaintenance = ($phaseInfo.Mode -eq "maintenance" -or $phaseInfo.Mode -eq "released")
    $isDevelopment = -not $isMaintenance

    # フェーズ表示色
    $phaseColor = if ($isMaintenance) { "Green" } else { "Cyan" }
    $phaseLabel = switch ($phaseInfo.Mode) {
        "maintenance" { "保守・運用中 (maintenance)" }
        "released"    { "リリース済み (released)" }
        default       { "開発中 (development)" }
    }
    $deployBadge = if ($phaseInfo.DeployReady -and $isDevelopment) { " 🚀 デプロイ準備完了!" } else { "" }

    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  🤖 ClaudeCode スタートアップツール v3.2 / v8.2 ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan

    Write-Host "  📋 フェーズ: " -NoNewline -ForegroundColor DarkGray
    Write-Host "$phaseLabel$deployBadge" -ForegroundColor $phaseColor
    Write-Host "  🔗 " -NoNewline -ForegroundColor Yellow
    Write-Host "$LinuxHost ➜ $LinuxBase" -NoNewline -ForegroundColor White
    Write-Host "  📂 " -NoNewline -ForegroundColor Green
    Write-Host "$LocalDir" -ForegroundColor DarkGreen
    Write-Host ""

    # 起動
    Write-Host "  🚀 " -NoNewline -ForegroundColor Cyan
    Write-Host "起動" -ForegroundColor DarkCyan
    Write-Host "   " -NoNewline; Write-Host " S1 " -NoNewline -ForegroundColor Black -BackgroundColor Yellow
    Write-Host "  ☁️  SSH (cron 自律 / 5h)" -ForegroundColor Yellow
    Write-Host "   " -NoNewline; Write-Host " L1 " -NoNewline -ForegroundColor Black -BackgroundColor Green
    Write-Host "  🖥️  ローカル (即起動)" -ForegroundColor Green
    Write-Host ""

    # デプロイ・保守移行（開発フェーズのみ）
    if ($isDevelopment) {
        Write-Host "  🚢 " -NoNewline -ForegroundColor Blue
        Write-Host "デプロイ管理" -ForegroundColor DarkBlue
        Write-Host "   " -NoNewline; Write-Host "  DP" -NoNewline -ForegroundColor Black -BackgroundColor Blue
        Write-Host "  🚀 デプロイ準備（Runbook生成・前提チェック）" -ForegroundColor Blue
        Write-Host "   " -NoNewline; Write-Host "  M " -NoNewline -ForegroundColor Black -BackgroundColor DarkCyan
        Write-Host "  🔄 保守モードへ移行（リリース完了後）" -ForegroundColor DarkCyan
        Write-Host ""
    }

    # インシデント・DevOps（保守フェーズのみ）
    if ($isMaintenance) {
        Write-Host "  🛡️  " -NoNewline -ForegroundColor Green
        Write-Host "保守・運用" -ForegroundColor DarkGreen
        Write-Host "   " -NoNewline; Write-Host "  I " -NoNewline -ForegroundColor Black -BackgroundColor Red
        Write-Host "  🚨 インシデント対応（P1/P2/P3トリアージ）" -ForegroundColor Red
        Write-Host "   " -NoNewline; Write-Host "  W " -NoNewline -ForegroundColor Black -BackgroundColor DarkGreen
        Write-Host "  📊 週次 DevOps レポート確認" -ForegroundColor DarkGreen
        Write-Host ""
    }

    # 診断・ツール
    Write-Host "  🔧 " -NoNewline -ForegroundColor Magenta
    Write-Host "診断・ツール" -ForegroundColor DarkMagenta
    @(
        " 5  🩺 ツール確認・診断",
        " 6  💾 ドライブマッピング診断",
        " 7  ⚙️  Windows Terminal セットアップ",
        " 8  🩹 MCP ヘルスチェック",
        " 9  🤝 Agent Teams ランタイム",
        "10  🌿 Worktree Manager",
        "11  🏛️  Architecture Check",
        "12  📊 Statusline 設定",
        "13  📡 Claude ログ監視タブを開く",
        "16  🤝 Agent Teams Status (CLI 表示)",
        "PD  🌐 Projects Dashboard (進捗 WebUI)",
        "MC  🎛️  Mission Control (統合管理 / Agent Teams 計測)",
        "DR  📌 Dashboard をタスクスケジューラーに登録（自動起動）",
        "DU  🗑️  Dashboard タスクを解除"
    ) | ForEach-Object { Write-Host "    $_" -ForegroundColor Magenta }
    Write-Host ""

    # Cron
    Write-Host "  ⏰ " -NoNewline -ForegroundColor Yellow
    Write-Host "Linux Cron 管理 " -NoNewline -ForegroundColor Yellow
    Write-Host "[SSH 専用]" -ForegroundColor DarkYellow
    Write-Host "   " -NoNewline; Write-Host " 14 " -NoNewline -ForegroundColor Black -BackgroundColor DarkBlue
    Write-Host "  📅  Cron スケジュール 登録・編集・削除" -ForegroundColor Cyan
    Write-Host "   " -NoNewline; Write-Host " 15 " -NoNewline -ForegroundColor Black -BackgroundColor DarkBlue
    Write-Host "  📺  Linux セッション状態監視 (リアルタイム)" -ForegroundColor Cyan
    Write-Host ""

    Write-Host $hr -ForegroundColor DarkGray
    Write-Host "    0  ❌  終了" -ForegroundColor Gray
    Write-Host $hr -ForegroundColor DarkGray
    Write-Host ""
}

function Invoke-MenuScript {
    param(
        [Parameter(Mandatory)]
        [string]$File,
        [string[]]$ScriptArgs = @()
    )

    & $ShellExe -NoProfile -ExecutionPolicy Bypass -File $File @ScriptArgs
    $scriptExitCode = $LASTEXITCODE

    Write-Host ""
    if ($scriptExitCode -ne 0) {
        $logDir = Join-Path $ProjectRoot "logs"
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        }
        $timestamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
        $logFile = Join-Path $logDir "menu-error-$timestamp.log"

        $logContent = @(
            "Timestamp : $timestamp"
            "Script    : $File"
            "Args      : $($ScriptArgs -join ' ')"
            "ExitCode  : $scriptExitCode"
            "Host      : $env:COMPUTERNAME"
        ) -join "`n"
        Set-Content -Path $logFile -Value $logContent -Encoding UTF8

        Write-Host "  ========================================" -ForegroundColor Red
        Write-Host "  エラーが発生しました (終了コード: $scriptExitCode)" -ForegroundColor Red
        Write-Host "  ログ: $logFile" -ForegroundColor Yellow
        Write-Host "  ========================================" -ForegroundColor Red
    }

    Write-Host ""
    Read-Host "  Enterキーでメニューに戻ります（Ctrl+Cでコピー可）"
}

function Invoke-ToolFromMenu {
    param(
        [Parameter(Mandatory)]
        [string]$Tool,
        [switch]$Local
    )

    $scriptArgs = @("-Tool", $Tool)
    if ($Local) {
        $scriptArgs += "-Local"
    }

    Invoke-MenuScript -File "scripts\main\Start-All.ps1" -ScriptArgs $scriptArgs
}

if ($env:AI_STARTUP_MENU_TEST_EXPORT -eq '1') {
    return
}

while ($true) {
    Show-Menu
    $choice = Read-Host "  番号を入力してください"

    switch ($choice.ToUpper()) {
        "S1" { Invoke-ToolFromMenu -Tool "claude" }
        "L1" { Invoke-ToolFromMenu -Tool "claude" -Local }
        "DP" { Invoke-MenuScript -File "scripts\main\Start-DeployPrep.ps1" }
        "M"  {
            Write-Host ""
            Write-Host "  保守モードへ移行します。" -ForegroundColor Cyan
            Write-Host "  デプロイ完了を確認しましたか？ (y/N): " -NoNewline -ForegroundColor Yellow
            $confirm = Read-Host
            if ($confirm.ToUpper() -eq "Y") {
                Invoke-MenuScript -File "scripts\main\Start-MaintenanceMode.ps1"
            } else {
                Write-Host "  キャンセルしました。" -ForegroundColor Gray
                Start-Sleep -Seconds 1
            }
        }
        "I"  { Invoke-MenuScript -File "scripts\main\Start-IncidentResponse.ps1" }
        "W"  { Invoke-MenuScript -File "scripts\main\Start-WeeklyDevOps.ps1" }
        "5"  { Invoke-MenuScript -File "scripts\test\Test-AllTools.ps1" }
        "6"  { Invoke-MenuScript -File "scripts\test\test-drive-mapping.ps1" }
        "7"  {
            $wtBgImage = if (
                ($Config.PSObject.Properties.Name -contains 'windowsTerminal') -and $Config.windowsTerminal -and
                ($Config.windowsTerminal.PSObject.Properties.Name -contains 'backgroundImage') -and $Config.windowsTerminal.backgroundImage
            ) { [string]$Config.windowsTerminal.backgroundImage } else { '' }
            $wtBgOpacity = if (
                ($Config.PSObject.Properties.Name -contains 'windowsTerminal') -and $Config.windowsTerminal -and
                ($Config.windowsTerminal.PSObject.Properties.Name -contains 'backgroundImageOpacity') -and $null -ne $Config.windowsTerminal.backgroundImageOpacity
            ) { [double]$Config.windowsTerminal.backgroundImageOpacity } else { 0.28 }
            $wtTheme = if (
                ($Config.PSObject.Properties.Name -contains 'windowsTerminal') -and $Config.windowsTerminal -and
                ($Config.windowsTerminal.PSObject.Properties.Name -contains 'theme') -and $Config.windowsTerminal.theme
            ) { [string]$Config.windowsTerminal.theme } else { 'One Half Dark' }
            $wtProfileName = if (
                ($Config.PSObject.Properties.Name -contains 'windowsTerminal') -and $Config.windowsTerminal -and
                ($Config.windowsTerminal.PSObject.Properties.Name -contains 'profileName') -and $Config.windowsTerminal.profileName
            ) { [string]$Config.windowsTerminal.profileName } else { 'AI CLI Startup' }
            $setupArgs = @('-Theme', $wtTheme, '-ProfileName', $wtProfileName)
            if (-not [string]::IsNullOrWhiteSpace($wtBgImage)) {
                $setupArgs += @('-BackgroundImage', $wtBgImage, '-BackgroundImageOpacity', $wtBgOpacity)
            }
            Invoke-MenuScript -File "scripts\setup\setup-windows-terminal.ps1" -ScriptArgs $setupArgs
        }
        "8"  { Invoke-MenuScript -File "scripts\test\Test-McpHealth.ps1" }
        "9"  { Invoke-MenuScript -File "scripts\test\Test-AgentTeams.ps1" }
        "10" { Invoke-MenuScript -File "scripts\test\Test-WorktreeManager.ps1" }
        "11" { Invoke-MenuScript -File "scripts\test\Test-ArchitectureCheck.ps1" }
        "12" { Invoke-MenuScript -File "scripts\main\Set-Statusline.ps1" }
        "13" {
            $watchScript = Join-Path $ProjectRoot "scripts\tools\Watch-ClaudeLog.ps1"
            & $ShellExe -NoProfile -ExecutionPolicy Bypass -File $watchScript -NewTab
            Write-Host ""
            Read-Host "  Enterキーでメニューに戻ります"
        }
        "14" { Invoke-MenuScript -File "scripts\main\New-CronSchedule.ps1" }
        "PD" { Invoke-MenuScript -File "scripts\main\Start-Dashboard.ps1" }
        "MC" {
            $env:AI_STARTUP_PROJECTS_DIR = $Config.projectsDir
            Start-Process "http://localhost:3737/mission-control"
            Write-Host "[MC] Mission Control: http://localhost:3737/mission-control" -ForegroundColor Cyan
            if (-not (Get-NetTCPConnection -LocalPort 3737 -ErrorAction SilentlyContinue)) {
                Invoke-MenuScript -File "scripts\main\Start-Dashboard.ps1" -ScriptArgs @('-NoBrowser')
            }
        }
        "DR" { Invoke-MenuScript -File "scripts\main\Register-DashboardTask.ps1" -ScriptArgs @('-RunNow') }
        "DU" { Invoke-MenuScript -File "scripts\main\Register-DashboardTask.ps1" -ScriptArgs @('-Unregister') }
        "16" {
            $statusScript = Join-Path $ProjectRoot "scripts\tools\agent-teams-status.js"
            if (Test-Path $statusScript) {
                Push-Location $ProjectRoot
                try { & node $statusScript }
                finally { Pop-Location }
            } else {
                Write-Host "  [ERROR] agent-teams-status.js not found: $statusScript" -ForegroundColor Red
            }
            Write-Host ""
            Read-Host "  Enterキーでメニューに戻ります"
        }
        "15" {
            $watchScript = Join-Path $ProjectRoot "scripts\tools\Watch-SessionInfoSSH.ps1"
            & $ShellExe -NoProfile -ExecutionPolicy Bypass -File $watchScript
            Write-Host ""
            Read-Host "  Enterキーでメニューに戻ります"
        }
        "0"  { exit 0 }
        default {
            Write-Host ""
            Write-Host "  無効な入力です。もう一度選択してください。" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
