<#
.SYNOPSIS
    Windows Terminal に情報タブ（Claude Session Info）を 1 枚開く。
.DESCRIPTION
    wt.exe -w 0 new-tab で新規タブを生成し、Watch-SessionInfo.ps1 を開始する。
    wt.exe が無い環境では Start-Process フォールバックを使う。
    ClaudeOS v3.1.0
#>

param(
    [Parameter(Mandatory)][string]$SessionId,
    [string]$SessionsDir = '',
    [string]$Title = 'Claude Session Info',
    [int]$PollIntervalSeconds = 1,
    [string]$WtProfile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$WatchScript = Join-Path $ScriptRoot 'scripts\tools\Watch-SessionInfo.ps1'

if (-not (Test-Path $WatchScript)) {
    Write-Host "[ERROR] Watch-SessionInfo.ps1 が見つかりません: $WatchScript" -ForegroundColor Red
    exit 1
}

$wtExe = Get-Command wt.exe -ErrorAction SilentlyContinue
$psExe = (Get-Process -Id $PID).Path

# Watch-SessionInfo.ps1 への引数
$psArgs = @(
    '-NoExit',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $WatchScript,
    '-SessionId', $SessionId,
    '-PollIntervalSeconds', $PollIntervalSeconds
)
if (-not [string]::IsNullOrWhiteSpace($SessionsDir)) {
    $psArgs += @('-SessionsDir', $SessionsDir)
}

try {
    if ($wtExe) {
        # wt.exe 経由で同一ウィンドウ (w 0) に新タブ
        $profilePart = if (-not [string]::IsNullOrWhiteSpace($WtProfile)) { " -p `"$WtProfile`"" } else { '' }
        # ArgumentList を文字列で渡し、スペース含みのプロファイル名・パスを確実に引用符で囲む
        # また -- セパレータで wt.exe 引数とシェルコマンドを明示的に区切る
        $wtArgStr = "-w 0 new-tab$profilePart --title `"$Title`" -- `"$psExe`" " + ($psArgs -join ' ')
        Start-Process -FilePath $wtExe.Source -ArgumentList $wtArgStr -WindowStyle Hidden
        Write-Host "[INFO] Claude Session Info タブを開きました (wt.exe)" -ForegroundColor Cyan
    }
    else {
        # フォールバック: 独立した PowerShell ウィンドウを起動
        Start-Process -FilePath $psExe -ArgumentList $psArgs -WindowStyle Normal
        Write-Host "[INFO] Claude Session Info ウィンドウを開きました (wt.exe 非検出、フォールバック)" -ForegroundColor Yellow
    }
    exit 0
}
catch {
    Write-Host "[WARN] Session Info タブの起動に失敗: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "[WARN] セッション本体は継続します。" -ForegroundColor Yellow
    exit 0
}
