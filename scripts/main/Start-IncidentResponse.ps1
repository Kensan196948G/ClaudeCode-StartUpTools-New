# ============================================================
# Start-IncidentResponse.ps1 - インシデント対応スクリプト（保守フェーズ専用）
# P1/P2/P3 トリアージを実施し、インシデント記録を作成する
# ============================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$StateFile   = Join-Path $ProjectRoot "state.json"
$ReportsDir  = Join-Path $ProjectRoot "reports"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Red
Write-Host "  ║  🚨 インシデント対応トリアージ       ║" -ForegroundColor Red
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""

# 優先度選択
Write-Host "  インシデントの優先度を選択してください:" -ForegroundColor Cyan
Write-Host "    P1  🔴 本番障害・データ毀損・セキュリティ侵害（即時対応）" -ForegroundColor Red
Write-Host "    P2  🟡 品質劣化・パフォーマンス低下・脆弱性（当日〜翌日）" -ForegroundColor Yellow
Write-Host "    P3  🟢 軽微バグ・依存更新・ドキュメント（次週対応）" -ForegroundColor Green
Write-Host "  優先度 (P1/P2/P3): " -NoNewline
$priority = (Read-Host).ToUpper()
if ($priority -notin @("P1","P2","P3")) { $priority = "P3" }

Write-Host ""
Write-Host "  インシデントの概要を入力してください: " -NoNewline -ForegroundColor Cyan
$summary = Read-Host

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$incidentId = "incident-$timestamp-$priority"
$incidentFile = Join-Path $ReportsDir "$incidentId.md"
New-Item -ItemType Directory -Force -Path $ReportsDir | Out-Null

# インシデントレポート作成
$agentChain = switch ($priority) {
    "P1" { "Debugger → Developer → QA → DevOps → CTO" }
    "P2" { "Developer → Reviewer → QA → DevOps" }
    "P3" { "Developer → QA（次週対応）" }
}
$deadline = switch ($priority) {
    "P1" { "即時対応" }
    "P2" { "当日〜翌日" }
    "P3" { "次週 Weekly DevOps セッション" }
}

$reportContent = @"
# インシデントレポート: $incidentId

## 基本情報
- **ID**: $incidentId
- **優先度**: $priority
- **検知日時**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- **対応期限**: $deadline
- **Agent起動チェーン**: $agentChain

## 概要
$summary

## 影響範囲
（記入してください）

## 原因調査
（記入してください）

## 対応手順
- [ ] 原因特定
- [ ] 修正実装
- [ ] テスト（回帰確認）
- [ ] デプロイ
- [ ] 動作確認

## 解決確認
- [ ] 問題が再現しないことを確認
- [ ] SLA稼働率への影響を確認
- [ ] Error Budget 残量を更新

## Post-mortem（P1のみ必須）
（P1の場合、根本原因・再発防止策を記入）

## state.json 更新（クローズ時）
``````json
{
  "maintenance": {
    "incident_count_30d": <現在値+1>,
    "last_incident_id": "$incidentId"
  }
}
``````
"@
Set-Content $incidentFile -Value $reportContent -Encoding UTF8

# state.json にオープンインシデントを記録
try {
    if (Test-Path $StateFile) {
        $state = Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -eq $state.maintenance.open_incidents) {
            $state.maintenance | Add-Member -MemberType NoteProperty -Name "open_incidents" -Value @() -Force
        }
        $incidents = [System.Collections.Generic.List[string]]($state.maintenance.open_incidents)
        $incidents.Add($incidentId)
        $state.maintenance.open_incidents = $incidents.ToArray()
        $state.maintenance.last_incident_id = $incidentId
        $state | ConvertTo-Json -Depth 20 | Set-Content $StateFile -Encoding UTF8
    }
} catch { $null = $_ }

Write-Host ""
Write-Host "  ✅ インシデントレポート作成: $incidentFile" -ForegroundColor Green
Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  対応フロー ($priority):" -ForegroundColor Cyan
Write-Host "  $agentChain" -ForegroundColor White
Write-Host ""
Write-Host "  次のステップ: レポートを確認し、Claude Code に対応を依頼してください" -ForegroundColor Yellow
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Enterキーでメニューに戻ります"
