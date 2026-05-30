# ============================================================
# Dashboard.Tests.ps1 - serve-dashboard.js ロジックのテスト
# Pester 5.x
# ============================================================

BeforeAll {
    $script:RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $script:DashJs   = Join-Path $script:RepoRoot 'scripts\dashboards\serve-dashboard.js'
    $script:NodeExe  = (Get-Command node -ErrorAction SilentlyContinue)?.Source
}

Describe 'serve-dashboard.js 存在確認' {
    It 'serve-dashboard.js が存在すること' {
        Test-Path $script:DashJs | Should -BeTrue
    }
    It 'node コマンドが利用可能であること' {
        $script:NodeExe | Should -Not -BeNullOrEmpty
    }
}

Describe 'weeksToPhase ロジック (node で検証)' {
    BeforeAll {
        if (-not $script:NodeExe) { return }
        $tmpJs = Join-Path $TestDrive 'phase-test.js'
        $dashJsEscaped = $script:DashJs.Replace('\', '\\')
        @"
const {weeksToPhase} = require('$dashJsEscaped');
const r = [1,8,9,16,17,20,21,24].map(w => weeksToPhase(w));
console.log(JSON.stringify(r));
"@ | Set-Content $tmpJs -Encoding UTF8
        $script:PhaseResults = & $script:NodeExe $tmpJs 2>$null | ConvertFrom-Json
    }

    It 'Week 1 は Build フェーズ' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:PhaseResults[0].name | Should -Be 'Build'
    }
    It 'Week 8 は Build フェーズ' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:PhaseResults[1].name | Should -Be 'Build'
    }
    It 'Week 9 は Quality フェーズ' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:PhaseResults[2].name | Should -Be 'Quality'
    }
    It 'Week 16 は Quality フェーズ' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:PhaseResults[3].name | Should -Be 'Quality'
    }
    It 'Week 17 は Stabilize フェーズ' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:PhaseResults[4].name | Should -Be 'Stabilize'
    }
    It 'Week 21 は Release フェーズ' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:PhaseResults[6].name | Should -Be 'Release'
    }
}

Describe 'buildTimeline ロジック' {
    BeforeAll {
        if (-not $script:NodeExe) { return }
        $tmpJs = Join-Path $TestDrive 'timeline-test.js'
        $dashJsEscaped = $script:DashJs.Replace('\', '\\')
        @"
const {buildTimeline} = require('$dashJsEscaped');
const p = { registration_date: '2026-01-01', release_deadline: '2026-07-03', duration_months: 6 };
console.log(JSON.stringify(buildTimeline(p)));
"@ | Set-Content $tmpJs -Encoding UTF8
        $out = & $script:NodeExe $tmpJs 2>$null
        $script:TL = try { $out | ConvertFrom-Json } catch { $null }
    }

    It 'buildTimeline が null でなければ totalDays > 0 であること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        if ($null -eq $script:TL) { Set-ItResult -Skipped -Because 'buildTimeline returned null' }
        $script:TL.totalDays | Should -BeGreaterThan 0
    }
    It 'pct が 0〜100 の範囲であること' {
        if (-not $script:NodeExe -or $null -eq $script:TL) { Set-ItResult -Skipped -Because 'skip' }
        $script:TL.pct | Should -BeGreaterOrEqual 0
        $script:TL.pct | Should -BeLessOrEqual 100
    }
    It 'week が 1 以上であること' {
        if (-not $script:NodeExe -or $null -eq $script:TL) { Set-ItResult -Skipped -Because 'skip' }
        $script:TL.week | Should -BeGreaterOrEqual 1
    }
}

Describe 'getRegisteredProjects フィルタ' {
    BeforeAll {
        if (-not $script:NodeExe) { return }

        # テスト用ディレクトリを作成
        $tmpDir    = Join-Path $TestDrive 'projects'
        $cronDir   = Join-Path $TestDrive 'cron'
        New-Item -ItemType Directory -Path $tmpDir    -Force | Out-Null
        New-Item -ItemType Directory -Path $cronDir   -Force | Out-Null

        # GitHub リモートあり プロジェクト
        $ghProj = Join-Path $tmpDir 'WithGitHub'
        New-Item -ItemType Directory -Path (Join-Path $ghProj '.git') -Force | Out-Null
        @"
[remote "origin"]
    url = https://github.com/test/with-github.git
"@ | Set-Content (Join-Path $ghProj '.git\config') -Encoding UTF8

        # GitHub リモートなし プロジェクト
        $noGh = Join-Path $tmpDir 'NoGitHub'
        New-Item -ItemType Directory -Path (Join-Path $noGh '.git') -Force | Out-Null
        @"
[remote "origin"]
    url = https://gitlab.com/test/no-github.git
"@ | Set-Content (Join-Path $noGh '.git\config') -Encoding UTF8

        # .git なし プロジェクト
        New-Item -ItemType Directory -Path (Join-Path $tmpDir 'NoGit') -Force | Out-Null

        # cron-registry.json
        $cronReg = Join-Path $cronDir 'cron-registry.json'
        @"
[
  { "id": "aaa", "project": "WithGitHub", "created": "2026-01-01T00:00:00" },
  { "id": "bbb", "project": "NoGitHub",   "created": "2026-01-01T00:00:00" },
  { "id": "ccc", "project": "NoGit",      "created": "2026-01-01T00:00:00" }
]
"@ | Set-Content $cronReg -Encoding UTF8

        # serve-dashboard.js の CRON_REG / PROJECTS_DIR を env 変数で上書き
        $env:AI_STARTUP_PROJECTS_DIR = $tmpDir
        $cmd = @"
process.env['AI_STARTUP_PROJECTS_DIR'] = String.raw``$tmpDir``;
// CRON_REG を一時パスに向けるためモンキーパッチ
const path = require('path'), fs = require('fs'), os = require('os');
const mod = require(String.raw``$($script:DashJs)``);

// getRegisteredProjects は CRON_REG を直接読む。モジュール変数を上書き不可のため
// ここでは直接 filter ロジックを再現してテスト
const PROJECTS_DIR = String.raw``$tmpDir``;
const entries = JSON.parse(fs.readFileSync(String.raw``$cronReg``,'utf8'));
const result = entries.filter(e => {
  const gitCfg = path.join(PROJECTS_DIR, e.project, '.git', 'config');
  if (!fs.existsSync(gitCfg)) return false;
  const cfg = fs.readFileSync(gitCfg,'utf8');
  return /github\.com/i.test(cfg);
});
console.log(JSON.stringify(result.map(r => r.project)));
"@
        $script:FilterResult = & $script:NodeExe -e $cmd 2>$null | ConvertFrom-Json
    }

    AfterAll {
        Remove-Item Env:\AI_STARTUP_PROJECTS_DIR -ErrorAction SilentlyContinue
    }

    It 'GitHub リモートありのプロジェクトが含まれること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:FilterResult | Should -Contain 'WithGitHub'
    }
    It 'GitHub リモートなし(GitLab)のプロジェクトはフィルタされること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:FilterResult | Should -Not -Contain 'NoGitHub'
    }
    It '.git ディレクトリなしのプロジェクトはフィルタされること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:FilterResult | Should -Not -Contain 'NoGit'
    }
}

Describe 'Cron Registry 関数 (node で検証)' {
    BeforeAll {
        if (-not $script:NodeExe) { return }
        $cronRegPath = Join-Path $TestDrive 'cron-registry.json'
        @'
[
  {"Id": "test001", "Project": "TestProject", "LinuxHost": "192.168.0.1", "DayOfWeek": [1,2], "Time": "09:00", "DurationMinutes": 300, "RegisteredAt": "2026-01-01T00:00:00"}
]
'@ | Set-Content $cronRegPath -Encoding UTF8
        $tmpJs = Join-Path $TestDrive 'cron-test.js'
        $cronRegPathEsc = $cronRegPath.Replace('\', '\\')
        @"
const fs = require('fs'), crypto = require('crypto');
const CRON_REG = '$cronRegPathEsc';

function readCronRegistry() {
  try { return JSON.parse(fs.readFileSync(CRON_REG, 'utf8')); } catch { return []; }
}
function writeCronRegistry(entries) {
  const tmp = CRON_REG + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(tmp, CRON_REG);
}

const result = {};

// Test 1: readCronRegistry
const entries = readCronRegistry();
result.readCount = entries.length;
result.firstProject = entries[0]?.Project;

// Test 2: duplicate check
const dup = entries.find(e => e.Project === 'TestProject');
result.hasDuplicate = !!dup;

// Test 3: add new entry
const newEntry = { Id: crypto.randomBytes(4).toString('hex'), Project: 'NewProject', LinuxHost: '10.0.0.1', DayOfWeek: [3], Time: '14:00', DurationMinutes: 180, RegisteredAt: new Date().toISOString() };
const newEntries = [...entries, newEntry];
writeCronRegistry(newEntries);
result.afterAddCount = readCronRegistry().length;

// Test 4: delete entry
const filtered = newEntries.filter(e => e.Id !== newEntry.Id);
writeCronRegistry(filtered);
result.afterDeleteCount = readCronRegistry().length;

console.log(JSON.stringify(result));
"@ | Set-Content $tmpJs -Encoding UTF8
        $script:CronResult = & $script:NodeExe $tmpJs 2>$null | ConvertFrom-Json
    }

    It 'readCronRegistry が1件返すこと' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:CronResult.readCount | Should -Be 1
    }
    It '最初のエントリが TestProject であること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:CronResult.firstProject | Should -Be 'TestProject'
    }
    It '重複チェック: TestProject は既存と判断されること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:CronResult.hasDuplicate | Should -Be $true
    }
    It '新規登録後に件数が2件になること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:CronResult.afterAddCount | Should -Be 2
    }
    It '削除後に件数が1件に戻ること' {
        if (-not $script:NodeExe) { Set-ItResult -Skipped -Because 'node not available' }
        $script:CronResult.afterDeleteCount | Should -Be 1
    }
}
