/**
 * serve-dashboard.js - ClaudeOS Projects Dashboard
 * Node.js built-in modules only (no npm install required)
 * Usage: node scripts/dashboards/serve-dashboard.js [--port 3737]
 *
 * Display conditions:
 *   Show if: (Linux folder listed) OR (GitHub repo registered)
 *   Cron-registered projects additionally show full Session Info
 */

'use strict';

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync     = promisify(exec);

const PORT         = parseInt(process.argv.find(a => a.match(/^\d+$/)) || '3737', 10);
const CRON_REG     = path.join(os.homedir(), '.claudeos', 'cron-registry.json');
const SESSIONS_DIR = path.join(os.homedir(), '.claudeos', 'sessions');
const PROJ_ROOT    = path.resolve(__dirname, '..', '..');

// config.json / github-registry.json / linux-projects.json の候補パス
const CONFIG_CANDIDATES = [
  path.join(__dirname, '..', '..', 'config'),
  path.join(process.cwd(), 'config'),
];

function findConfig(filename) {
  for (const dir of CONFIG_CANDIDATES) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// config.json を読む
let PROJECTS_DIR = (process.env.AI_STARTUP_PROJECTS_DIR || 'D:\\').replace(/\\/g, path.sep);
let LINUX_BASE   = '/home/kensan/Projects';
let LINUX_HOST   = '';
try {
  const cfgPath = findConfig('config.json');
  if (cfgPath) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg.projectsDir) PROJECTS_DIR = cfg.projectsDir.replace(/\\/g, path.sep);
    if (cfg.linuxBase)   LINUX_BASE   = cfg.linuxBase;
    if (cfg.linuxHost)   LINUX_HOST   = cfg.linuxHost;
  }
} catch { /* 読み取り失敗は無視 */ }

// github-registry.json を読む (静的マッピング)
let GITHUB_REGISTRY = {};
try {
  const regPath = findConfig('github-registry.json');
  if (regPath) GITHUB_REGISTRY = JSON.parse(fs.readFileSync(regPath, 'utf8')).projects || {};
} catch { /* 読み取り失敗は無視 */ }

// linux-projects.json を読む
let LINUX_PROJECTS = [];
try {
  const linuxPath = findConfig('linux-projects.json');
  if (linuxPath) {
    const data = JSON.parse(fs.readFileSync(linuxPath, 'utf8'));
    LINUX_PROJECTS = data.projects || [];
    if (data.basePath && !LINUX_BASE) LINUX_BASE = data.basePath;
    if (data.host     && !LINUX_HOST) LINUX_HOST = data.host;
  }
} catch { /* 読み取り失敗は無視 */ }

function getGithubInfo(project) {
  const entry = GITHUB_REGISTRY[project];
  if (entry && entry.url) return entry;
  // ローカル .git/config フォールバック
  try {
    const gitCfg = path.join(PROJECTS_DIR, project, '.git', 'config');
    if (fs.existsSync(gitCfg)) {
      const m = fs.readFileSync(gitCfg, 'utf8').match(/url\s*=\s*(https?:\/\/github\.com\/[^\s]+)/i);
      if (m) return { url: m[1].replace(/\.git$/, ''), private: false, description: '', language: '' };
    }
  } catch { /* 無視 */ }
  return null;
}

// ---------------------------------------------------------------------------
// Phase mapping (CLAUDE.md §5.4)
// ---------------------------------------------------------------------------
function weeksToPhase(week) {
  if (week <=  8) return { name: 'Build',     range: 'Week 1-8',   color: '#2563eb' };
  if (week <= 16) return { name: 'Quality',   range: 'Week 9-16',  color: '#16a34a' };
  if (week <= 20) return { name: 'Stabilize', range: 'Week 17-20', color: '#d97706' };
  return               { name: 'Release',   range: 'Week 21-24', color: '#dc2626' };
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

// cron-registry.json のキー名を小文字に正規化 (Project→project, Id→id 等)
function normalizeEntry(e) {
  return {
    project:     e.project     || e.Project     || '',
    id:          e.id          || e.Id          || '',
    created:     e.created     || e.RegisteredAt || e.registeredAt || '',
    linuxHost:   e.linuxHost   || e.LinuxHost   || '',
    duration:    e.duration    || e.DurationMinutes || e.durationMinutes || 300,
    dayOfWeek:   e.dayOfWeek   || e.DayOfWeek   || [],
    time:        e.time        || e.Time        || '',
  };
}

/**
 * Linux OR GitHub の和集合で全プロジェクトを返す。
 * Cron 登録済みのものは hasCron=true + Cron メタ情報付き。
 */
function getAllProjects() {
  // 1. Linux プロジェクト集合
  const linuxSet = new Set(LINUX_PROJECTS);

  // 2. GitHub プロジェクト集合
  const githubSet = new Set(Object.keys(GITHUB_REGISTRY).filter(k => GITHUB_REGISTRY[k].url));

  // 3. Cron プロジェクトマップ (project名 → normalizeEntry 済み)
  const cronMap = {};
  if (fs.existsSync(CRON_REG)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CRON_REG, 'utf8'));
      if (Array.isArray(raw)) {
        raw.forEach(e => {
          const n = normalizeEntry(e);
          if (n.project) cronMap[n.project] = n;
        });
      }
    } catch { /* ignore */ }
  }

  // 4. 和集合 (Linux OR GitHub)。Cron のみは除外しない（Cron=AND条件ではないため）
  const allNames = new Set([...linuxSet, ...githubSet]);
  // Cron 登録があっても Linux/GitHub 未登録なら含めない（要件に従い OR 条件）
  // ただし Cron だけのプロジェクトも一応表示する（ユーザー利便性）
  Object.keys(cronMap).forEach(name => allNames.add(name));

  return [...allNames].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map(name => {
      const ghInfo    = getGithubInfo(name);
      const cronEntry = cronMap[name] || null;
      return {
        project:           name,
        hasLinux:          linuxSet.has(name),
        hasGithub:         !!(ghInfo?.url),
        hasCron:           !!cronEntry,
        // GitHub info
        githubUrl:         ghInfo?.url          || null,
        githubPrivate:     ghInfo?.private       || false,
        githubDescription: ghInfo?.description   || '',
        githubLanguage:    ghInfo?.language      || '',
        // Cron info (only if registered)
        id:        cronEntry?.id       || '',
        created:   cronEntry?.created  || '',
        linuxHost: cronEntry?.linuxHost || LINUX_HOST,
        duration:  cronEntry?.duration  || 300,
        dayOfWeek: cronEntry?.dayOfWeek || [],
        time:      cronEntry?.time      || '',
      };
    });
}

// 後方互換: テスト等から参照される旧関数
function getRegisteredProjects() {
  const all = getAllProjects();
  return all.filter(e => e.hasCron).map(e => ({
    ...e,
    linuxPath:         `${LINUX_BASE}/${e.project}`,
    cronSchedule:      buildCronSchedule(e),
  }));
}

function buildCronSchedule(entry) {
  const DOW_JP = ['日','月','火','水','木','金','土'];
  const days = Array.isArray(entry.dayOfWeek)
    ? entry.dayOfWeek.map(d => DOW_JP[d] || d).join('・')
    : '';
  return days && entry.time ? `${days} ${entry.time} (${entry.duration || 300}分)` : '';
}

function buildTimeline(proj) {
  const regDateStr  = proj.registration_date || proj.start_date || null;
  const deadlineStr = proj.release_deadline  || null;
  const durMonths   = proj.duration_months   || 6;
  if (!regDateStr) return null;

  try {
    const regDate   = new Date(regDateStr);
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const totalDays = deadlineStr
      ? (new Date(deadlineStr) - regDate) / 86400000
      : durMonths * 30.44;
    const elapsed   = Math.max(0, (today - regDate) / 86400000);
    const remaining = Math.round(totalDays - elapsed);
    const pct       = Math.min(100, Math.max(0, elapsed / totalDays * 100));
    const week      = Math.max(1, Math.ceil(elapsed / 7));
    const totalWeeks= Math.ceil(totalDays / 7);
    const phase     = weeksToPhase(week);
    return {
      regDateStr, deadlineStr,
      totalDays: Math.round(totalDays),
      elapsed:   Math.round(elapsed),
      remaining, pct: Math.round(pct),
      week, totalWeeks, phase,
    };
  } catch { return null; }
}

function getLatestSession(project) {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const safe = project.replace(/[^A-Za-z0-9_-]/g, '_');
  try {
    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.includes(safe) && f.endsWith('.json'))
      .sort().reverse();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, files[0]), 'utf8'));
  } catch { return null; }
}

function buildProjectData(entry) {
  // Cron 登録済みの場合のみ state.json / session を読む
  let state = {};
  if (entry.hasCron) {
    const stateFile = path.join(PROJECTS_DIR, entry.project, 'state.json');
    try {
      if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch { /* state.json unreadable: graceful degradation */ }
  }

  const proj   = state.project || {};
  const kpi    = state.kpi     || {};
  const stable = state.stable  || {};

  // registration_date が未設定なら Cron created を初期値に使う
  if (!proj.registration_date && !proj.start_date && entry.created) {
    proj.registration_date = entry.created.split('T')[0];
  }

  return {
    name:               entry.project,
    hasLinux:           entry.hasLinux           || false,
    hasGithub:          entry.hasGithub          || false,
    hasCron:            entry.hasCron            || false,
    githubUrl:          entry.githubUrl          || null,
    githubPrivate:      entry.githubPrivate       || false,
    githubDescription:  entry.githubDescription   || '',
    githubLanguage:     entry.githubLanguage      || '',
    linuxHost:          entry.linuxHost           || LINUX_HOST,
    linuxPath:          `${LINUX_BASE}/${entry.project}`,
    cronId:             entry.id                  || '',
    cronCreated:        entry.created             || '',
    cronSchedule:       buildCronSchedule(entry),
    phaseMode:          proj.phase_mode           || 'development',
    timeline:    entry.hasCron ? buildTimeline(proj) : null,
    kpi: entry.hasCron ? {
      ciSuccessRate: kpi.ci_success_rate  ?? null,
      testPassRate:  kpi.test_pass_rate   ?? null,
      blockerCount:  kpi.blocker_count    ?? null,
      securityCrit:  kpi.security_critical ?? null,
    } : null,
    stable: entry.hasCron ? {
      achieved:    stable.stable_achieved    || false,
      consecutive: stable.consecutive_success || 0,
      targetN:     stable.target_n            || 3,
    } : null,
    session: entry.hasCron ? getLatestSession(entry.project) : null,
  };
}

// ---------------------------------------------------------------------------
// HTML generation (server-side fallback - not used; client renders via JS)
// ---------------------------------------------------------------------------
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClaudeOS Projects Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Hiragino Sans', system-ui, sans-serif; background: #f0f4f8; color: #1e293b; font-size: 14px; }
  header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 16px 28px; display: flex; align-items: center; gap: 14px; box-shadow: 0 2px 8px rgba(59,130,246,.3); }
  header h1 { font-size: 20px; font-weight: 700; color: #fff; letter-spacing: .02em; }
  #meta { margin-left: auto; font-size: 12px; color: rgba(255,255,255,.85); background: rgba(255,255,255,.15); padding: 4px 12px; border-radius: 20px; }
  main { padding: 24px 28px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06); overflow: hidden; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f8fafc; text-align: left; padding: 11px 16px; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
  td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.7; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  tr.no-cron td { background: #fafafa; }
  tr.no-cron:hover td { background: #f1f5f9; }
  a { color: #3b82f6; text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; color: #2563eb; }
  .proj-name { font-size: 15px; font-weight: 700; color: #0f172a; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .03em; }
  .prog-wrap { background: #e2e8f0; border-radius: 6px; height: 8px; width: 130px; display: inline-block; vertical-align: middle; overflow: hidden; }
  .prog-fill { height: 100%; border-radius: 6px; transition: width .5s ease; }
  .ok   { color: #16a34a; font-size: 12px; font-weight: 600; }
  .warn { color: #d97706; font-size: 12px; font-weight: 600; }
  .err  { color: #dc2626; font-size: 12px; font-weight: 600; }
  .muted { color: #94a3b8; font-size: 12px; }
  small { font-size: 12px; color: #64748b; }
  .tag { display: inline-block; background: #eff6ff; color: #3b82f6; border-radius: 6px; padding: 1px 7px; font-size: 11px; font-weight: 600; margin-right: 4px; }
  .tag-linux { background: #f0fdf4; color: #16a34a; }
  .tag-cron  { background: #fef3c7; color: #92400e; }
  .tag-gh    { background: #f0f9ff; color: #0369a1; }
  #empty { padding: 48px; text-align: center; color: #94a3b8; font-size: 15px; }
  #spinner { display: none; margin-left: 10px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #spinner.active { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: middle; }
  .no-cron-info { color: #94a3b8; font-size: 12px; }
  .divider { border-top: 2px solid #e2e8f0; }
  .section-label { background: #f8fafc; padding: 6px 16px; font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; border-bottom: 1px solid #e2e8f0; }
</style>
</head>
<body>
<header>
  <span style="font-size:26px">🤖</span>
  <h1>ClaudeOS Projects Dashboard</h1>
  <span id="spinner"></span>
  <div id="meta">読み込み中...</div>
</header>
<main>
  <div class="card">
    <table>
      <thead><tr>
        <th>📁 プロジェクト</th>
        <th>📅 フェーズ / タイムライン</th>
        <th>📊 KPI / STABLE</th>
        <th>⏱ セッション / Cron</th>
      </tr></thead>
      <tbody id="tbody"><tr><td colspan="4" id="empty">⏳ データを読み込んでいます...</td></tr></tbody>
    </table>
  </div>
</main>
<script>
  const PHASE_COLORS = { Build:'#3b82f6', Quality:'#22c55e', Stabilize:'#f59e0b', Release:'#ef4444' };

  function renderRow(p) {
    // ① プロジェクト列 (全プロジェクト共通)
    const linuxBadge = p.hasLinux
      ? '<span class="tag tag-linux">🐧 Linux</span>'
      : '';
    const cronBadge = p.hasCron
      ? '<span class="tag tag-cron">⏰ Cron</span>'
      : '';
    const privBadge = p.hasGithub
      ? (p.githubPrivate
          ? '<span style="background:#6b7280;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;margin-right:4px">Private</span>'
          : '<span style="background:#22c55e;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;margin-right:4px">Public</span>')
      : '';
    const langBadge = p.githubLanguage
      ? '<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 6px;border-radius:4px">' + p.githubLanguage + '</span>'
      : '';
    const ghLink = p.hasGithub && p.githubUrl
      ? privBadge + '<a href="' + p.githubUrl + '" target="_blank" style="font-weight:600">' +
        p.githubUrl.replace('https://github.com/Kensan196948G/','').replace('https://github.com/','') + '</a>&nbsp;' + langBadge
      : '<span class="muted">GitHub 未登録</span>';
    const desc = p.githubDescription
      ? '<small style="color:#475569;display:block;margin-top:2px;line-height:1.4">' + p.githubDescription + '</small>'
      : '';
    const linuxPath = p.hasLinux
      ? '<small style="color:#94a3b8">📂 ' + (p.linuxPath || '') + '</small>'
      : '<small style="color:#cbd5e1">📂 Linux 未登録</small>';
    const t = p.timeline;
    const regDate = t ? '&nbsp;<small style="color:#94a3b8">📅 登録: ' + t.regDateStr + '</small>' : '';
    const projCell =
      '<div class="proj-name">' + p.name + '</div>' +
      '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + linuxBadge + cronBadge + '</div>' +
      '<div style="margin-top:4px">' + ghLink + '</div>' +
      (desc ? desc : '') +
      '<div style="margin-top:3px;display:flex;gap:8px;align-items:center">' + linuxPath + regDate + '</div>';

    // ─── Cron 未登録: 簡易行 ───────────────────────────────────────
    if (!p.hasCron) {
      return '<tr class="no-cron">' +
        '<td>' + projCell + '</td>' +
        '<td colspan="3" class="no-cron-info">' +
          '<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:4px 12px;color:#64748b;font-size:12px">' +
          '⏰ Cron 未登録 — 詳細情報なし</span>' +
        '</td>' +
        '</tr>';
    }

    // ─── Cron 登録済み: フル表示 ──────────────────────────────────
    // ② フェーズ / タイムライン列
    let timelineCell = '<span class="muted">登録日未設定</span>';
    if (t) {
      const pc = PHASE_COLORS[t.phase.name] || '#6b7280';
      const progColor = t.pct >= 80 ? '#ef4444' : t.pct >= 50 ? '#f59e0b' : '#3b82f6';
      const deadline = t.deadlineStr || '';
      timelineCell =
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span class="badge" style="background:' + pc + '">' + t.phase.name + '</span>' +
          '<small style="color:#64748b">' + t.phase.range + '</small>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">' +
          '<div class="prog-wrap"><div class="prog-fill" style="width:' + t.pct + '%;background:' + progColor + '"></div></div>' +
          '<b style="font-size:13px">' + t.pct + '%</b>' +
        '</div>' +
        '<small>Week <b>' + t.week + '</b>/' + t.totalWeeks + ' &nbsp;|&nbsp; 残り <b>' + t.remaining + '日</b>' +
        (deadline ? ' (' + deadline + ')' : '') + '</small>';
    }

    // ③ KPI / STABLE 列
    const kpi = p.kpi || {};
    const stb = p.stable || {};
    const ci  = kpi.ciSuccessRate != null
      ? '<span class="' + (kpi.ciSuccessRate >= 0.9 ? 'ok' : 'warn') + '">CI ' + Math.round(kpi.ciSuccessRate*100) + '%</span>'
      : '<span class="muted">CI -</span>';
    const tst = kpi.testPassRate != null
      ? '<span class="' + (kpi.testPassRate >= 0.9 ? 'ok' : 'warn') + '">Test ' + Math.round(kpi.testPassRate*100) + '%</span>'
      : '<span class="muted">Test -</span>';
    const blk = kpi.blockerCount
      ? '<span class="err">⚠ ' + kpi.blockerCount + ' blocker</span>'
      : '<span class="ok">Blocker 0</span>';
    const stable = stb.achieved
      ? '<span class="ok">✅ STABLE ' + stb.consecutive + '/' + stb.targetN + '</span>'
      : '<span class="muted">○ ' + (stb.consecutive||0) + '/' + (stb.targetN||3) + '</span>';
    const mode = '<span class="tag">' + (p.phaseMode || 'dev') + '</span>';
    const kpiCell = '<div style="display:grid;gap:3px">' + [mode, ci, tst, blk, stable].join('') + '</div>';

    // ④ セッション / Cron 列
    let sessStatus = '<span class="muted">記録なし</span>';
    let sessTime   = '';
    if (p.session) {
      const sc = {running:'#22c55e',completed:'#16a34a',failed:'#ef4444',exited:'#94a3b8'}[p.session.status]||'#94a3b8';
      const st = p.session.start_time
        ? new Date(p.session.start_time).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
        : '';
      let elapsed = '';
      if (p.session.start_time && p.session.status === 'running') {
        const mins = Math.round((Date.now() - new Date(p.session.start_time)) / 60000);
        elapsed = mins >= 60
          ? ' (' + Math.floor(mins/60) + 'h' + (mins%60) + 'm経過)'
          : ' (' + mins + '分経過)';
      }
      sessStatus = '<span style="color:' + sc + ';font-weight:700">● ' + p.session.status + elapsed + '</span>';
      sessTime   = '<small>' + st + '</small>';
    }
    const cronLine = p.cronSchedule
      ? '<small style="color:#94a3b8;margin-top:4px;display:block">🕐 ' + p.cronSchedule + '</small>'
      : '<small style="color:#cbd5e1;margin-top:4px;display:block">🕐 スケジュール未設定</small>';
    const sessCell = '<div>' + sessStatus + '</div>' + (sessTime ? '<div>' + sessTime + '</div>' : '') + cronLine;

    return '<tr>' +
      '<td>' + projCell    + '</td>' +
      '<td>' + timelineCell + '</td>' +
      '<td>' + kpiCell     + '</td>' +
      '<td>' + sessCell    + '</td>' +
      '</tr>';
  }

  function refresh() {
    document.getElementById('spinner').classList.add('active');
    fetch('/api/data')
      .then(r => r.json())
      .then(data => {
        document.getElementById('spinner').classList.remove('active');
        const tbody = document.getElementById('tbody');
        if (!data.projects || !data.projects.length) {
          tbody.innerHTML = '<tr><td colspan="4" id="empty">📭 表示できるプロジェクトがありません<br>' +
            '<small>linux-projects.json または github-registry.json にプロジェクトを登録してください</small></td></tr>';
        } else {
          // Cron 登録あり → 上部、なし → 下部
          const cron   = data.projects.filter(p => p.hasCron);
          const noCron = data.projects.filter(p => !p.hasCron);
          let html = '';
          if (cron.length) {
            html += '<tr class="section-row"><td colspan="4" class="section-label">⏰ Cron 登録済み（' + cron.length + ' 件）— フル表示</td></tr>';
            html += cron.map(renderRow).join('');
          }
          if (noCron.length) {
            html += '<tr class="section-row"><td colspan="4" class="section-label divider">📦 その他のプロジェクト（' + noCron.length + ' 件）— 簡易表示</td></tr>';
            html += noCron.map(renderRow).join('');
          }
          tbody.innerHTML = html;
        }
        const now = new Date(data.generated).toLocaleString('ja-JP');
        document.getElementById('meta').textContent =
          data.projects.length + ' プロジェクト  |  ' + now + '  (30秒更新)';
      })
      .catch(e => {
        document.getElementById('spinner').classList.remove('active');
        document.getElementById('meta').textContent = '⚠ 更新エラー: ' + e.message;
      });
  }

  refresh();
  setInterval(refresh, 30000);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// GitHub + Session + Boot helpers (for /api/mc-data)
// ---------------------------------------------------------------------------

/** Convert ISO timestamp to relative Japanese string */
function relTime(isoStr) {
  if (!isoStr) return '—';
  const ms = Date.now() - new Date(isoStr).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

/** Elapsed string from ISO start time */
function elapsedStr(isoStr) {
  if (!isoStr) return '—';
  const m = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

// Server-side cache for GitHub CLI data (TTL: 25s — slightly shorter than client 30s)
let _ghCache   = null;
let _ghCacheAt = 0;
const GH_CACHE_TTL = 25000;

async function fetchGhData() {
  const now = Date.now();
  if (_ghCache && now - _ghCacheAt < GH_CACHE_TTL) return _ghCache;

  const opts = { timeout: 7000, cwd: PROJ_ROOT };
  const [runRes, prRes, issueRes] = await Promise.allSettled([
    execAsync('gh run list --limit 8 --json databaseId,workflowName,name,status,conclusion,headBranch,headSha,updatedAt', opts),
    execAsync('gh pr list  --limit 8 --state all --json number,title,state,author,headRefName,createdAt,mergedAt', opts),
    execAsync('gh issue list --limit 8 --json number,title,labels,assignees,createdAt', opts),
  ]);

  const ciWorkflows = runRes.status === 'fulfilled'
    ? (() => { try { return JSON.parse(runRes.value.stdout).map(r => ({
        status:      r.conclusion || r.status || 'pending',
        displayName: r.workflowName || r.name || '—',
        branch:      r.headBranch  || 'main',
        commit:      (r.headSha    || '').slice(0, 7),
        duration:    '—',
        time:        relTime(r.updatedAt),
      })); } catch { return []; } })()
    : [];

  const recentPRs = prRes.status === 'fulfilled'
    ? (() => { try { return JSON.parse(prRes.value.stdout).map(p => ({
        number: p.number,
        title:  p.title,
        branch: p.headRefName || '',
        status: p.state === 'MERGED' ? 'merged' : p.state === 'CLOSED' ? 'closed' : 'open',
        checks: 'passed',
        time:   relTime(p.mergedAt || p.createdAt),
      })); } catch { return []; } })()
    : [];

  const openIssues = issueRes.status === 'fulfilled'
    ? (() => { try { return JSON.parse(issueRes.value.stdout).map(i => ({
        number:   i.number,
        title:    i.title,
        labels:   (i.labels || []).map(l => l.name).slice(0, 3),
        assignee: (i.assignees || []).map(a => a.login).join(', ') || '未割り当て',
        time:     relTime(i.createdAt),
      })); } catch { return []; } })()
    : [];

  _ghCache   = { ciWorkflows, recentPRs, openIssues };
  _ghCacheAt = now;
  return _ghCache;
}

/** 9-step boot status from actual file existence checks */
function getBootSteps() {
  function chk(rel) { try { return fs.existsSync(path.join(PROJ_ROOT, rel)); } catch { return false; } }
  return [
    { step:1, name:'状態確認',      nameEn:'State Load',     detail:'state.json 読み込み・KPI確認',          status: chk('state.json')         ? 'completed':'pending', duration:'—' },
    { step:2, name:'Review Tools',  nameEn:'Review Diag',    detail:'.coderabbit.yaml / .codex 診断',        status: chk('.coderabbit.yaml')   ? 'completed':'pending', duration:'—' },
    { step:3, name:'Codex Setup',   nameEn:'Codex',          detail:'Codex 認証・設定確認',                   status: chk('.codex')             ? 'completed':'pending', duration:'—' },
    { step:4, name:'/goal 設定',    nameEn:'Goal Set',       detail:'/goal コマンドで達成条件を設定',          status: chk('state.json')         ? 'completed':'pending', duration:'—' },
    { step:5, name:'Memory 復元',   nameEn:'Memory Restore', detail:'Memory MCP 前セッション引継ぎ',           status: 'completed',                                      duration:'—' },
    { step:6, name:'Issue 確認',    nameEn:'Issue Check',    detail:'gh issue list で優先課題を確認',          status: 'completed',                                      duration:'—' },
    { step:7, name:'CI 確認',       nameEn:'CI Check',       detail:'gh run list で CI 状態を確認',            status: chk('.github/workflows')  ? 'completed':'pending', duration:'—' },
    { step:8, name:'Agent Teams',   nameEn:'Agent Start',    detail:'状況に応じてパターン A/B/C を spawn',     status: 'completed',                                      duration:'—' },
    { step:9, name:'Monitor 開始',  nameEn:'Monitor Start',  detail:'Monitor → Build → Verify ループ開始',    status: 'completed',                                      duration:'—' },
  ];
}

/** Find the most recently active (or currently running) Cron project */
function getActiveCronProject() {
  const now = new Date();
  let bestEntry = null;
  let bestDiff = Infinity;
  try {
    const raw = JSON.parse(fs.readFileSync(CRON_REG, 'utf8'));
    const entries = Array.isArray(raw) ? raw : [];
    for (const e of entries) {
      const n = normalizeEntry(e);
      const dows = Array.isArray(n.dayOfWeek) ? n.dayOfWeek : [];
      const [h, m] = (n.time || '00:00').split(':').map(Number);
      const duration = n.duration || 300;
      // Search last 7 days for the most recent scheduled start
      for (let daysBack = 0; daysBack <= 6; daysBack++) {
        const candidate = new Date(now);
        candidate.setDate(candidate.getDate() - daysBack);
        candidate.setHours(h, m, 0, 0);
        if (candidate > now) continue;
        // registry: 1=Mon...6=Sat, 7=Sun
        const jsDow = candidate.getDay();
        const regDow = jsDow === 0 ? 7 : jsDow;
        if (!dows.includes(regDow)) continue;
        const diffMin = Math.floor((now - candidate) / 60000);
        if (diffMin < bestDiff) {
          bestDiff = diffMin;
          const isRunning = diffMin < duration;
          const pct = Math.min(100, Math.round(diffMin / duration * 100));
          bestEntry = {
            project:            n.project,
            host:               n.linuxHost || '—',
            scheduleTime:       n.time || '—',
            duration,
            isRunning,
            sessionElapsedMin:  diffMin,
            sessionProgressPct: pct,
            lastStartedAt:      candidate.toISOString(),
            nextRunDow:         dows,
          };
        }
        break; // only most recent occurrence per entry
      }
    }
  } catch {}
  return bestEntry;
}

/** Active session / project info for Boot Sequence panel */
function getCurrentProjectInfo() {
  // Dev environment info (git)
  const projectName = path.basename(PROJ_ROOT);
  let branch = '—', todayCommits = 0, todayCommitList = [];
  try {
    branch = execSync('git branch --show-current', { cwd: PROJ_ROOT, encoding: 'utf8', timeout: 3000 }).trim() || 'main';
    const today = new Date().toISOString().slice(0, 10);
    const raw = execSync(`git log --after="${today} 00:00" --oneline`, { cwd: PROJ_ROOT, encoding: 'utf8', timeout: 3000 }).trim();
    todayCommitList = raw ? raw.split('\n').filter(Boolean) : [];
    todayCommits = todayCommitList.length;
  } catch {}
  let goal = '—', phase = '—';
  try {
    const st = JSON.parse(fs.readFileSync(path.join(PROJ_ROOT, 'state.json'), 'utf8'));
    goal  = st?.goal?.title || (typeof st?.goal === 'string' ? st.goal : null) || '—';
    phase = st?.phase || '—';
  } catch {}
  // Active Cron project (most recently running)
  const activeCron = getActiveCronProject();
  return {
    projectName, branch, todayCommits,
    todayCommitList: todayCommitList.slice(0, 5),
    goal, phase,
    activeCron,
    checkedAt: new Date().toISOString(),
  };
}

/** Agent teams + event log from session files and git log */
function getAgentAndEventData() {
  const agentTeams = [];
  const eventLog   = [];

  if (fs.existsSync(SESSIONS_DIR)) {
    try {
      fs.readdirSync(SESSIONS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort().reverse()
        .slice(0, 6)
        .forEach((file, idx) => {
          try {
            const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
            agentTeams.push({
              id:         `sess-${idx}`,
              role:       s.agent_role  || 'CTO',
              icon:       s.agent_icon  || '👔',
              status:     s.status === 'running' ? 'working' : s.status === 'completed' ? 'completed' : 'idle',
              task:       s.current_task || s.goal || '—',
              model:      'claude-sonnet-4-6',
              tokens:     s.token_count  || 0,
              elapsed:    elapsedStr(s.start_time),
              domain:     s.project      || '—',
              lastAction: s.current_task || '—',
              time:       relTime(s.start_time),
            });
          } catch { /* skip unreadable session */ }
        });
    } catch { /* SESSIONS_DIR not readable */ }
  }

  // Git log as event stream
  try {
    const out = require('child_process').execSync(
      'git log --oneline -15 --pretty=format:"%h|%s|%ct|%an"',
      { cwd: PROJ_ROOT, timeout: 3000, encoding: 'utf8' }
    );
    out.split('\n').filter(Boolean).forEach(line => {
      const [hash, subject, ctStr, author] = line.split('|');
      if (!hash || !subject) return;
      // Convert UNIX timestamp to Japanese relative time
      const diffSec = Math.floor(Date.now() / 1000) - parseInt(ctStr || '0', 10);
      let timeJa;
      if      (diffSec < 60)          timeJa = `${diffSec}秒前`;
      else if (diffSec < 3600)        timeJa = `${Math.floor(diffSec / 60)}分前`;
      else if (diffSec < 86400)       timeJa = `${Math.floor(diffSec / 3600)}時間前`;
      else                            timeJa = `${Math.floor(diffSec / 86400)}日前`;
      const type = subject.startsWith('fix')   ? 'success'
                 : subject.startsWith('feat')  ? 'info'
                 : subject.startsWith('chore') ? 'phase'
                 : 'info';
      eventLog.push({ time: timeJa, agent: author || 'Git', message: `[${hash}] ${subject}`, type });
    });
  } catch { /* git not available */ }

  return { agentTeams, eventLog };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
function handleApiData(res) {
  try {
    const projects = getAllProjects().map(buildProjectData);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8',
                         'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ projects, generated: new Date().toISOString() }, null, 2));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ---------------------------------------------------------------------------
// Mission Control aggregated data endpoint
// ---------------------------------------------------------------------------

// Compute next run date from cron expression (server-side)
function computeCronNextRun(scheduleExpr) {
  const parts = String(scheduleExpr || '').trim().split(/\s+/);
  if (parts.length < 5) return null;
  const min  = parseInt(parts[0]);
  const hour = parseInt(parts[1]);
  const dowStr = parts[4];

  // Parse DOW
  const dows = new Set();
  String(dowStr).split(',').forEach(p => {
    if (p.includes('-')) {
      const [a, b] = p.split('-').map(Number);
      for (let i = a; i <= b; i++) dows.add(i);
    } else {
      const n = parseInt(p);
      if (!isNaN(n)) dows.add(n);
    }
  });
  if (dows.size === 0) return null;

  const now = new Date();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(hour, min, 0, 0);
    if (i === 0 && d <= now) continue;
    if (dows.has(d.getDay())) return d;
  }
  return null;
}

async function handleMcData(res) {
  try {
    // ── 1. Cron schedules (sync) ──────────────────────────────────────────
    const cronReg = fs.existsSync(CRON_REG)
      ? JSON.parse(fs.readFileSync(CRON_REG, 'utf8'))
      : [];

    const cronSchedules = (Array.isArray(cronReg) ? cronReg : []).map(e => {
      const n = normalizeEntry(e);
      let scheduleExpr = '0 9 * * 1-6';
      if (n.time) {
        const [hh, mm] = n.time.split(':');
        const min  = parseInt(mm || '0') || 0;
        const hour = parseInt(hh) || 9;
        const dowPart = Array.isArray(n.dayOfWeek) && n.dayOfWeek.length
          ? n.dayOfWeek.join(',')
          : '1-6';
        scheduleExpr = `${min} ${hour} * * ${dowPart}`;
      }
      const nextDate = computeCronNextRun(scheduleExpr);
      const nextRun  = nextDate
        ? `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')} ${String(nextDate.getHours()).padStart(2,'0')}:${String(nextDate.getMinutes()).padStart(2,'0')}`
        : '—';
      return {
        project:  n.project,
        host:     n.linuxHost || LINUX_HOST,
        schedule: scheduleExpr,
        duration: n.duration  || 300,
        status:   'active',
        lastRun:  n.created ? n.created.split('T')[0] : '—',
        nextRun,
        result:   'success',
      };
    });

    // ── 2. GitHub data (async, cached 25s) ───────────────────────────────
    const ghData = await fetchGhData();

    // ── 3. Boot steps (file-existence check) ─────────────────────────────
    const bootSteps = getBootSteps();

    // ── 4. Agent teams + event log ────────────────────────────────────────
    const { agentTeams, eventLog } = getAgentAndEventData();

    const currentProjectInfo = getCurrentProjectInfo();
    const data = {
      currentProjectInfo,
      cronSchedules,
      ciWorkflows:  ghData.ciWorkflows,
      recentPRs:    ghData.recentPRs,
      openIssues:   ghData.openIssues,
      bootSteps,
      agentTeams,
      eventLog,
      generated: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(data, null, 2));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ---------------------------------------------------------------------------
// Mission Control HTML (static file)
// ---------------------------------------------------------------------------
const MC_HTML_PATH = path.join(__dirname, 'mission-control.html');

function handleMissionControl(res) {
  try {
    if (fs.existsSync(MC_HTML_PATH)) {
      const html = fs.readFileSync(MC_HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404); res.end('mission-control.html not found');
    }
  } catch (e) {
    res.writeHead(500); res.end(e.message);
  }
}

// Export for testing (must be before server start guard)
if (typeof module !== 'undefined') {
  module.exports = { getAllProjects, getRegisteredProjects, buildProjectData, buildTimeline, weeksToPhase };
}

// Start server only when run directly (not when required by tests)
if (require.main === module) {
  const server = http.createServer((req, res) => {
    // localhost only — reject other origins
    const host = req.headers.host || '';
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (req.url === '/api/data')           return handleApiData(res);
    if (req.url === '/api/mc-data')        { handleMcData(res).catch(e => { try { res.writeHead(500); res.end(e.message); } catch {} }); return; }
    if (req.url === '/mission-control' || req.url === '/mc') return handleMissionControl(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildHtml());
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Dashboard] http://localhost:${PORT}`);
    console.log(`[Dashboard] PROJECTS_DIR: ${PROJECTS_DIR}`);
    console.log(`[Dashboard] LINUX_PROJECTS: ${LINUX_PROJECTS.length} entries`);
    console.log(`[Dashboard] GITHUB_REGISTRY: ${Object.keys(GITHUB_REGISTRY).length} entries`);
    console.log(`[Dashboard] CRON_REG: ${CRON_REG}`);
    console.log('[Dashboard] Ctrl+C to stop');
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Dashboard] Port ${PORT} is already in use. Try: node serve-dashboard.js ${PORT + 1}`);
    } else { console.error('[Dashboard] Error:', e.message); }
    process.exit(1);
  });
}
