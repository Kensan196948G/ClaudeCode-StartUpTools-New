<#
.SYNOPSIS
    ReasoningBank 管理ツール — ClaudeOS v8.2 Stage-3
.DESCRIPTION
    .claude/claudeos/data/reasoning-bank.json の閲覧・統計・整理・エクスポートを行う。

    使用例:
      .\Manage-ReasoningBank.ps1                      # 対話メニュー
      .\Manage-ReasoningBank.ps1 -Action List         # エントリ一覧
      .\Manage-ReasoningBank.ps1 -Action Stats        # プロジェクト別統計
      .\Manage-ReasoningBank.ps1 -Action Purge        # 低信頼エントリ削除
      .\Manage-ReasoningBank.ps1 -Action Export       # Markdown エクスポート
      .\Manage-ReasoningBank.ps1 -Action Simulate     # 注入シミュレーション
.PARAMETER Action
    実行するアクション: List / Stats / Purge / Export / Simulate
.PARAMETER MinConfidence
    Purge の閾値（既定: 0.30）
.PARAMETER OutputPath
    Export の出力先パス（既定: reasoning-bank-export.md）
.PARAMETER TopN
    Simulate で表示するパターン数（既定: 3）
#>

[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', 'MinConfidence', Justification = 'Reserved for future confidence-filtered output; API surface must remain stable')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', 'OutputPath',    Justification = 'Reserved for future file-export feature; API surface must remain stable')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', 'TopN',          Justification = 'Reserved for future top-N ranking; API surface must remain stable')]
param(
    [ValidateSet('List','Stats','Purge','Export','Simulate','')]
    [string]$Action = '',
    [double]$MinConfidence = 0.30,
    [string]$OutputPath = '',
    [int]$TopN = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BankPath   = Join-Path $ScriptRoot '.claude\claudeos\data\reasoning-bank.json'

# ------------------------------------------------------------------ 共通関数

function Read-Bank {
    if (-not (Test-Path $BankPath)) {
        Write-Host "[INFO] reasoning-bank.json が見つかりません: $BankPath" -ForegroundColor Yellow
        return $null
    }
    $json = Get-Content $BankPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $json -or -not $json.entries) {
        Write-Host "[INFO] エントリが空です。" -ForegroundColor Yellow
        return $null
    }
    return $json
}

function Write-Bank {
    param([object]$Bank)
    $json = $Bank | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($BankPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))
}

function Format-Conf {
    param([double]$c)
    $bar = [string]::new('▰', [math]::Round($c * 10))
    $empty = [string]::new('▱', 10 - [math]::Round($c * 10))
    return "$bar$empty $($c.ToString('0.00'))"
}

function Get-ConfColor {
    param([double]$c)
    if ($c -ge 0.8) { return 'Green' }
    if ($c -ge 0.5) { return 'Cyan'  }
    if ($c -ge 0.3) { return 'Yellow'}
    return 'Red'
}

# ------------------------------------------------------------------ List

function Invoke-List {
    $bank = Read-Bank; if (-not $bank) { return }
    $entries = @($bank.entries | Sort-Object confidence -Descending)
    Write-Host ""
    Write-Host "  ══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "   ReasoningBank エントリ一覧  ($($entries.Count) 件)" -ForegroundColor Cyan
    Write-Host "  ══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""

    foreach ($e in $entries) {
        $color = Get-ConfColor -c $e.confidence
        $tags  = ($e.tags | Select-Object -First 5) -join ','
        $date  = ($e.timestamp -replace 'T.*','')
        Write-Host ("  [{0}] {1}" -f $date, $e.id) -ForegroundColor DarkGray
        Write-Host ("    信頼: {0}  | {1} | phase={2}" -f (Format-Conf $e.confidence), $e.outcome, $e.phase) -ForegroundColor $color
        Write-Host ("    tags: [{0}]" -f $tags) -ForegroundColor DarkGray
        Write-Host ("    問題: {0}" -f $e.problem_pattern)
        $app = if ($e.approach.Length -gt 100) { $e.approach.Substring(0,100) + '…' } else { $e.approach }
        Write-Host ("    対応: {0}" -f $app) -ForegroundColor DarkGray
        Write-Host ""
    }
    Write-Host "  合計: $($entries.Count) エントリ" -ForegroundColor Cyan
}

# ------------------------------------------------------------------ Stats

function Invoke-Stats {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '', Justification = 'Stats is a commonly used compound abbreviation for statistics; renaming would reduce readability')]
    param()
    $bank = Read-Bank; if (-not $bank) { return }
    $entries = @($bank.entries)
    Write-Host ""
    Write-Host "  ══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "   ReasoningBank 統計" -ForegroundColor Cyan
    Write-Host "  ══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host ("  総エントリ数 : {0}" -f $entries.Count)
    $avgConf = if ($entries.Count -gt 0) { ($entries | Measure-Object -Property confidence -Average).Average } else { 0 }
    Write-Host ("  平均信頼度   : {0}" -f $avgConf.ToString('0.00'))

    Write-Host ""
    Write-Host "  [プロジェクト別]" -ForegroundColor Cyan
    $entries | Group-Object project | ForEach-Object {
        $avg = ($_.Group | Measure-Object -Property confidence -Average).Average
        $succ = ($_.Group | Where-Object { $_.outcome -eq 'success' }).Count
        Write-Host ("    {0,-35} entries={1,3}  avg_conf={2}  success={3}/{1}" -f $_.Name, $_.Count, $avg.ToString('0.00'), $succ)
    }

    Write-Host ""
    Write-Host "  [フェーズ別]" -ForegroundColor Cyan
    $entries | Group-Object phase | Sort-Object Count -Descending | ForEach-Object {
        Write-Host ("    {0,-12} {1} 件" -f $_.Name, $_.Count)
    }

    Write-Host ""
    Write-Host "  [タグ頻度 Top10]" -ForegroundColor Cyan
    $tagFreq = @{}
    $entries | ForEach-Object { $_.tags | ForEach-Object { $tagFreq[$_] = ($tagFreq[$_] ?? 0) + 1 } }
    $tagFreq.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object {
        Write-Host ("    {0,-18} {1} 件" -f $_.Key, $_.Value)
    }

    Write-Host ""
    Write-Host "  [信頼度分布]" -ForegroundColor Cyan
    $ranges = @(
        @{Label='High   (0.8–1.0)'; Min=0.8; Max=1.0},
        @{Label='Mid    (0.5–0.8)'; Min=0.5; Max=0.8},
        @{Label='Low    (0.3–0.5)'; Min=0.3; Max=0.5},
        @{Label='Border (0.15–0.3)';Min=0.15;Max=0.3}
    )
    foreach ($r in $ranges) {
        $cnt = @($entries | Where-Object { $_.confidence -ge $r.Min -and $_.confidence -lt $r.Max }).Count
        $color = if ($r.Min -ge 0.8){'Green'} elseif ($r.Min -ge 0.5){'Cyan'} elseif ($r.Min -ge 0.3){'Yellow'} else {'Red'}
        Write-Host ("    {0}  {1,3} 件" -f $r.Label, $cnt) -ForegroundColor $color
    }
}

# ------------------------------------------------------------------ Purge

function Invoke-Purge {
    $bank = Read-Bank; if (-not $bank) { return }
    $before = $bank.entries.Count
    $bank.entries = @($bank.entries | Where-Object { $_.confidence -ge $MinConfidence })
    $removed = $before - $bank.entries.Count
    if ($removed -gt 0) {
        Write-Bank -Bank $bank
        Write-Host "[OK] $removed 件のエントリを削除しました（閾値: conf >= $MinConfidence）。残: $($bank.entries.Count) 件。" -ForegroundColor Green
    } else {
        Write-Host "[INFO] 削除対象なし（全エントリが conf >= $MinConfidence）。" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------ Export (Markdown)

function Invoke-Export {
    $bank = Read-Bank; if (-not $bank) { return }
    $outPath = if ([string]::IsNullOrWhiteSpace($OutputPath)) {
        Join-Path $ScriptRoot 'reasoning-bank-export.md'
    } else { $OutputPath }

    $lines = @()
    $lines += "# ReasoningBank エクスポート"
    $lines += ""
    $lines += "> 生成日時: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $lines += "> エントリ数: $($bank.entries.Count)"
    $lines += ""
    $lines += "---"
    $lines += ""

    $bank.entries | Sort-Object confidence -Descending | ForEach-Object {
        $lines += "## $($_.id)"
        $lines += ""
        $lines += "| 項目 | 値 |"
        $lines += "|---|---|"
        $lines += "| 日時 | $($_.timestamp -replace 'T',' ' -replace '\..+','') |"
        $lines += "| プロジェクト | $($_.project) |"
        $lines += "| フェーズ | $($_.phase) |"
        $lines += "| 結果 | $($_.outcome) |"
        $lines += "| 信頼度 | $($_.confidence.ToString('0.00')) |"
        $lines += "| タグ | $($_.tags -join ', ') |"
        $lines += "| STABLE | $($_.stable_achieved) |"
        $lines += "| CI 通過 | $($_.ci_passed) |"
        $lines += ""
        $lines += "**問題パターン**: $($_.problem_pattern)"
        $lines += ""
        $lines += "**対応アプローチ**:"
        $lines += ""
        $lines += $_.approach
        $lines += ""
        $lines += "---"
        $lines += ""
    }

    [System.IO.File]::WriteAllText($outPath, ($lines -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Host "[OK] エクスポート完了: $outPath" -ForegroundColor Green
}

# ------------------------------------------------------------------ Simulate (注入シミュレーション)

function Invoke-Simulate {
    $bank = Read-Bank; if (-not $bank) { return }
    $stateFile = Join-Path $ScriptRoot 'state.json'
    if (-not (Test-Path $stateFile)) {
        Write-Host "[ERROR] state.json が見つかりません。" -ForegroundColor Red; return
    }
    $state   = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $phase   = $state.execution.phase    ?? 'unknown'
    $summary = $state.execution.last_session_summary ?? ''
    $project = Split-Path $ScriptRoot -Leaf

    # Node.js で retrieveRelevantPatterns を呼び出す
    $nodeScript = @"
const rb   = require('./.claude/claudeos/scripts/hooks/reasoning-bank.js');
const path = require('path');
const fs   = require('fs');
const bank = rb.loadBank('.claude/claudeos/data');
const tags = rb.extractTags($( ($summary | ConvertTo-Json) ));
const pats = rb.retrieveRelevantPatterns(bank, '$project', '$phase', tags, $TopN);
console.log(JSON.stringify(pats, null, 2));
"@
    $result = node -e $nodeScript 2>&1
    try {
        $patterns = $result | ConvertFrom-Json
        if ($patterns.Count -eq 0) {
            Write-Host "[INFO] 関連パターンが見つかりませんでした（バンクにエントリが不足している可能性があります）。" -ForegroundColor Yellow
            return
        }
        Write-Host ""
        Write-Host "  [ReasoningBank] 過去の有効パターン（現在のコンテキストに注入されるもの）:" -ForegroundColor Cyan
        for ($i = 0; $i -lt $patterns.Count; $i++) {
            $p = $patterns[$i]
            $color = Get-ConfColor -c $p.confidence
            Write-Host ("  [{0}] conf={1} | {2} | phase={3} | tags=[{4}]" -f ($i+1), $p.confidence.ToString('0.00'), $p.outcome, $p.phase, ($p.tags -join ',')) -ForegroundColor $color
            Write-Host ("       問題: {0}" -f $p.problem_pattern)
            $app = if ($p.approach.Length -gt 120) { $p.approach.Substring(0,120) + '…' } else { $p.approach }
            Write-Host ("       対応: {0}" -f $app) -ForegroundColor DarkGray
            Write-Host ""
        }
    } catch {
        Write-Host "[WARN] パターン取得失敗: $result" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------ 対話メニュー

function Show-Menu {
    while ($true) {
        Clear-Host
        Write-Host ""
        Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host "   ReasoningBank 管理ツール  ClaudeOS v8.2" -ForegroundColor Cyan
        Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host ""
        $bank = Read-Bank
        $count = if ($bank) { $bank.entries.Count } else { 0 }
        Write-Host "  バンク: $BankPath" -ForegroundColor DarkGray
        Write-Host "  エントリ数: $count 件" -ForegroundColor $(if ($count -gt 0) {'Green'} else {'Yellow'})
        Write-Host ""
        Write-Host "    [1] エントリ一覧 (List)"   -ForegroundColor Yellow
        Write-Host "    [2] 統計 (Stats)"           -ForegroundColor Yellow
        Write-Host "    [3] 注入シミュレーション (Simulate)" -ForegroundColor Yellow
        Write-Host "    [4] 低信頼エントリ削除 (Purge)" -ForegroundColor Yellow
        Write-Host "    [5] Markdown エクスポート (Export)" -ForegroundColor Yellow
        Write-Host "    [0] 終了"                   -ForegroundColor DarkGray
        Write-Host ""
        $choice = Read-Host "  番号を入力"
        switch ($choice) {
            '1' { Invoke-List;     Read-Host "`n  Enter で戻ります" | Out-Null }
            '2' { Invoke-Stats;    Read-Host "`n  Enter で戻ります" | Out-Null }
            '3' { Invoke-Simulate; Read-Host "`n  Enter で戻ります" | Out-Null }
            '4' {
                $thresh = Read-Host "  削除閾値（Enter で $MinConfidence）"
                if (-not [string]::IsNullOrWhiteSpace($thresh)) { $script:MinConfidence = [double]$thresh }
                Invoke-Purge
                Read-Host "`n  Enter で戻ります" | Out-Null
            }
            '5' {
                $out = Read-Host "  出力パス（Enter でデフォルト）"
                if (-not [string]::IsNullOrWhiteSpace($out)) { $script:OutputPath = $out }
                Invoke-Export
                Read-Host "`n  Enter で戻ります" | Out-Null
            }
            '0' { return }
            default { Write-Host "  無効な入力です。" -ForegroundColor Red; Start-Sleep 1 }
        }
    }
}

# ------------------------------------------------------------------ エントリポイント

switch ($Action) {
    'List'     { Invoke-List }
    'Stats'    { Invoke-Stats }
    'Purge'    { Invoke-Purge }
    'Export'   { Invoke-Export }
    'Simulate' { Invoke-Simulate }
    default    { Show-Menu }
}
