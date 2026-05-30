# ============================================================
# Start-WeeklyDevOps.ps1 - 週次 DevOps レポート確認スクリプト（保守フェーズ専用）
# state.json の保守KPI・インシデント状況をサマリー表示する
# ============================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$StateFile   = Join-Path $ProjectRoot "state.json"
$ReportsDir  = Join-Path $ProjectRoot "reports"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor DarkGreen
Write-Host "  ║  📊 週次 DevOps レポート             ║" -ForegroundColor DarkGreen
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor DarkGreen
Write-Host ""

if (-not (Test-Path $StateFile)) {
    Write-Host "  [ERROR] state.json が見つかりません" -ForegroundColor Red
    exit 1
}

try {
    $state = Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $m = $state.maintenance
    $d = $state.deploy

    Write-Host "  ── 保守KPI ──────────────────────────────" -ForegroundColor Cyan
    Write-Host "  フェーズ:             $($m.phase_mode)" -ForegroundColor White
    Write-Host "  リリース日時:         $($m.released_at ?? '未設定')" -ForegroundColor White
    Write-Host "  SLA目標稼働率:        $([math]::Round($m.sla_target_availability * 100, 1))%" -ForegroundColor White
    Write-Host "  MTTR目標:            $($m.mttr_target_hours) 時間以内" -ForegroundColor White
    Write-Host "  Error Budget残量:    $($m.error_budget_remaining_pct)%" -ForegroundColor $(if ($m.error_budget_remaining_pct -gt 20) { "Green" } else { "Red" })
    Write-Host "  30日インシデント件数: $($m.incident_count_30d)" -ForegroundColor $(if ($m.incident_count_30d -eq 0) { "Green" } else { "Yellow" })
    Write-Host ""

    Write-Host "  ── オープンインシデント ──────────────────" -ForegroundColor Cyan
    if ($m.open_incidents -and $m.open_incidents.Count -gt 0) {
        foreach ($inc in $m.open_incidents) {
            Write-Host "  ⚠️  $inc" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✅ オープンインシデントなし" -ForegroundColor Green
    }
    Write-Host ""

    Write-Host "  ── 定期DevOps 最終実行日 ────────────────" -ForegroundColor Cyan
    Write-Host "  週次 DevOps:   $($m.last_weekly_devops ?? '未実行')" -ForegroundColor White
    Write-Host "  月次 Security: $($m.last_security_audit ?? '未実行')" -ForegroundColor White
    Write-Host "  四半期 Review: $($m.last_quarterly_review ?? '未実行')" -ForegroundColor White
    Write-Host ""

    Write-Host "  ── GitHub Actions 定期ワークフロー ───────" -ForegroundColor Cyan
    Write-Host "  週次:  .github/workflows/weekly-devops.yml  (毎週月曜 09:00 JST)" -ForegroundColor DarkGray
    Write-Host "  月次:  .github/workflows/monthly-security.yml (毎月1日 02:00 JST)" -ForegroundColor DarkGray
    Write-Host "  四半期:.github/workflows/quarterly-review.yml (3/6/9/12月1日)" -ForegroundColor DarkGray
    Write-Host ""

    # レポートファイル一覧
    $recentReports = @(Get-ChildItem $ReportsDir -Filter "*.md" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 5)
    if ($recentReports.Count -gt 0) {
        Write-Host "  ── 最近のレポート ────────────────────────" -ForegroundColor Cyan
        foreach ($r in $recentReports) {
            Write-Host "  📄 $($r.Name)  ($($r.LastWriteTime.ToString('yyyy-MM-dd')))" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

} catch {
    Write-Host "  [ERROR] state.json 読み込み失敗: $_" -ForegroundColor Red
}

Read-Host "  Enterキーでメニューに戻ります"
