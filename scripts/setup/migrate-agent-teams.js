#!/usr/bin/env node
// migrate-agent-teams.js — Agent Teams 計測機能を既存登録プロジェクトに配布
//
// 背景:
// - 本プロジェクト (ClaudeCode-StartUpTools-New) で実装した Agent Teams 計測 hook を
//   全登録プロジェクトに伝播する。
// - TemplateSyncManager の Initialize-ProjectTemplate は init-only のため、
//   既存登録プロジェクトには変更が永遠に届かない。
//
// 配布対象 (3 ファイル):
// - .claude/claudeos/scripts/hooks/agent-teams-tracker.js (新規ファイル)
// - .claude/claudeos/scripts/hooks/session-start.js       (推奨パターン提示拡張)
// - .claude/settings.json                                  (PostToolUse matcher 追加)
//
// 安全性:
// - 冪等 (何回実行しても結果が同じ)
// - settings.json は差分マージ (既存ユーザカスタマイズを保持)
// - hook ファイルはバックアップ作成 (*.bak-agent-teams)
// - --dry-run で実行前プレビュー
// - --rollback でバックアップから復元
//
// 使い方:
//   node scripts/setup/migrate-agent-teams.js --dry-run                # プレビュー
//   node scripts/setup/migrate-agent-teams.js --apply                  # 全プロジェクト適用
//   node scripts/setup/migrate-agent-teams.js --apply --project ProjA  # 個別適用
//   node scripts/setup/migrate-agent-teams.js --rollback               # 復元
//
// SSH 越し実行時の注意 (Linux):
//   非 TTY では Node の stdout がブロックバッファされ、完走していても出力が出ず「固まった」
//   ように見える。stdbuf で行バッファ化し timeout で保護すると安全:
//     ssh host 'cd <repo> && timeout 120 stdbuf -oL -eL node scripts/setup/migrate-agent-teams.js --apply'

const fs   = require("fs");
const path = require("path");

const BACKUP_SUFFIX = ".bak-agent-teams";

// 配布対象 hook ファイル (canonical source は本プロジェクトのテンプレ配下)
const SOURCE_FILES = {
  "agent-teams-tracker.js": path.join(__dirname, "..", "..", "Claude", "templates", "claudeos", "scripts", "hooks", "agent-teams-tracker.js"),
  "session-start.js":       path.join(__dirname, "..", "..", "Claude", "templates", "claudeos", "scripts", "hooks", "session-start.js"),
};

// settings.json に追加する PostToolUse matcher エントリ
const NEW_MATCHERS = [
  {
    matcher: "TeamCreate",
    hooks: [{ type: "command", command: "node .claude/claudeos/scripts/hooks/agent-teams-tracker.js" }],
  },
  {
    matcher: "SendMessage",
    hooks: [{ type: "command", command: "node .claude/claudeos/scripts/hooks/agent-teams-tracker.js" }],
  },
];

// ──────────────────────────────────────────────────────────────────────
// 引数パース
// ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { mode: null, projectFilter: null, configPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === "--dry-run")  args.mode = "dry-run";
    else if (a === "--apply")    args.mode = "apply";
    else if (a === "--rollback") args.mode = "rollback";
    else if (a === "--project")  args.projectFilter = argv[++i];
    else if (a === "--config")   args.configPath = argv[++i];
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
  }
  if (!args.mode) {
    console.error("ERROR: must specify one of --dry-run / --apply / --rollback");
    printHelp();
    process.exit(2);
  }
  return args;
}

function printHelp() {
  console.log(`
Agent Teams migration script — distributes Agent Teams measurement hooks
to existing registered projects.

Usage:
  node scripts/setup/migrate-agent-teams.js --dry-run                # preview diffs
  node scripts/setup/migrate-agent-teams.js --apply                  # apply to all projects
  node scripts/setup/migrate-agent-teams.js --apply --project NAME   # apply to specific project
  node scripts/setup/migrate-agent-teams.js --rollback               # restore from *.bak-agent-teams

Options:
  --config <path>   Path to config.json or linux-projects.json (default: auto-detect)
  --project <name>  Filter by project name

SSH tip (Linux): run with line-buffered stdout so output streams instead of
appearing to hang on non-TTY sessions:
  ssh host 'cd <repo> && timeout 120 stdbuf -oL -eL node scripts/setup/migrate-agent-teams.js --apply'
`);
}

// ──────────────────────────────────────────────────────────────────────
// プロジェクト discovery (migrate-phase7.js と同じパターン)
// ──────────────────────────────────────────────────────────────────────
function expandUserPath(p) {
  if (!p) return p;
  return p.replace(/^%USERPROFILE%/i, process.env.USERPROFILE || process.env.HOME || "");
}

function discoverProjectsFromWindowsConfig(cfg) {
  const projectsDir = cfg.projectsDir;
  if (!projectsDir) { console.error("ERROR: config.json has no projectsDir"); return []; }
  const seen = new Set(), projects = [];

  const historyFile = expandUserPath((cfg.recentProjects && cfg.recentProjects.historyFile) || "");
  if (historyFile && fs.existsSync(historyFile)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
      for (const entry of history.projects || []) {
        if (!entry.project || seen.has(entry.project)) continue;
        seen.add(entry.project);
        const projectPath = path.join(projectsDir, entry.project);
        // .claude ディレクトリがあるプロジェクトのみ対象
        if (!fs.existsSync(path.join(projectPath, ".claude"))) continue;
        projects.push({ name: entry.project, path: projectPath, _source: "recent" });
      }
    } catch (e) { console.error(`WARN: failed to parse ${historyFile}: ${e.message}`); }
  }

  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || seen.has(e.name)) continue;
      const projectPath = path.join(projectsDir, e.name);
      if (!fs.existsSync(path.join(projectPath, ".claude"))) continue;
      seen.add(e.name);
      projects.push({ name: e.name, path: projectPath, _source: "scan" });
    }
  } catch { /* ignore */ }

  return projects;
}

function discoverProjectsFromLinuxConfig(cfg) {
  const basePath = cfg.basePath;
  if (!basePath) { console.error("ERROR: linux-projects.json has no basePath"); return []; }
  const seen = new Set(), projects = [];

  for (const name of cfg.projects || []) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const projectPath = path.join(basePath, name);
    if (!fs.existsSync(projectPath)) continue;
    if (!fs.existsSync(path.join(projectPath, ".claude"))) continue;
    projects.push({ name, path: projectPath, _source: "linux-registry" });
  }

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || seen.has(e.name)) continue;
      const projectPath = path.join(basePath, e.name);
      if (!fs.existsSync(path.join(projectPath, ".claude"))) continue;
      seen.add(e.name);
      projects.push({ name: e.name, path: projectPath, _source: "scan" });
    }
  } catch { /* ignore */ }

  return projects;
}

function loadRegisteredProjects(configPath) {
  const candidates = configPath ? [configPath] : [
    path.join(process.cwd(), "config", "config.json"),
    path.join(process.cwd(), "config", "linux-projects.json"),
  ];
  let cfgPath = null;
  for (const c of candidates) { if (fs.existsSync(c)) { cfgPath = c; break; } }
  if (!cfgPath) { console.error(`WARN: no config file found. Tried: ${candidates.join(", ")}`); return []; }

  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); }
  catch (e) { console.error(`ERROR: failed to parse ${cfgPath}: ${e.message}`); process.exit(3); }

  console.log(`[discovery] using config: ${cfgPath}`);
  if (cfg.basePath && Array.isArray(cfg.projects)) return discoverProjectsFromLinuxConfig(cfg);
  if (cfg.projectsDir) return discoverProjectsFromWindowsConfig(cfg);
  console.error(`ERROR: ${cfgPath} has neither basePath+projects nor projectsDir`);
  return [];
}

// ──────────────────────────────────────────────────────────────────────
// 個別プロジェクト処理
// ──────────────────────────────────────────────────────────────────────
function computePlan(project) {
  const plan = {
    project: project.name,
    files: [],            // { action: "copy"|"replace"|"patch", path, reason }
    skipReason: null,
  };

  const hooksDir   = path.join(project.path, ".claude", "claudeos", "scripts", "hooks");
  const settingsFn = path.join(project.path, ".claude", "settings.json");

  if (!fs.existsSync(hooksDir)) {
    plan.skipReason = `hooks dir missing: ${hooksDir}`;
    return plan;
  }
  if (!fs.existsSync(settingsFn)) {
    plan.skipReason = `settings.json missing: ${settingsFn}`;
    return plan;
  }

  // 1. agent-teams-tracker.js (新規 or 更新)
  const trackerDest = path.join(hooksDir, "agent-teams-tracker.js");
  const trackerSrc  = SOURCE_FILES["agent-teams-tracker.js"];
  if (!fs.existsSync(trackerDest)) {
    plan.files.push({ action: "copy", path: trackerDest, src: trackerSrc, reason: "new file" });
  } else if (fs.readFileSync(trackerDest, "utf8") !== fs.readFileSync(trackerSrc, "utf8")) {
    plan.files.push({ action: "replace", path: trackerDest, src: trackerSrc, reason: "content differs" });
  }

  // 2. session-start.js (更新時のみ。canonical と異なる場合)
  const sessSrc  = SOURCE_FILES["session-start.js"];
  const sessDest = path.join(hooksDir, "session-start.js");
  if (!fs.existsSync(sessDest)) {
    plan.files.push({ action: "copy", path: sessDest, src: sessSrc, reason: "new file" });
  } else if (fs.readFileSync(sessDest, "utf8") !== fs.readFileSync(sessSrc, "utf8")) {
    plan.files.push({ action: "replace", path: sessDest, src: sessSrc, reason: "content differs (will be overwritten)" });
  }

  // 3. settings.json (PostToolUse matcher 差分マージ)
  let settings;
  try { settings = JSON.parse(fs.readFileSync(settingsFn, "utf8")); }
  catch (e) {
    plan.files.push({ action: "error", path: settingsFn, reason: `parse failed: ${e.message}` });
    return plan;
  }
  settings.hooks = settings.hooks || {};
  const postToolUse = Array.isArray(settings.hooks.PostToolUse) ? settings.hooks.PostToolUse : [];
  const existingMatchers = new Set(postToolUse.map(e => e.matcher));
  const missingMatchers  = NEW_MATCHERS.filter(m => !existingMatchers.has(m.matcher));
  if (missingMatchers.length > 0) {
    plan.files.push({
      action: "patch",
      path: settingsFn,
      reason: `add matchers: ${missingMatchers.map(m => m.matcher).join(", ")}`,
      _missingMatchers: missingMatchers,
    });
  }

  return plan;
}

function applyPlan(plan, dryRun) {
  const log = msg => console.log(`  [${plan.project}] ${msg}`);

  if (plan.skipReason) { log(`SKIP: ${plan.skipReason}`); return { status: "skipped", reason: plan.skipReason }; }
  if (plan.files.length === 0) { log(`OK: already up-to-date`); return { status: "up-to-date" }; }

  for (const f of plan.files) {
    if (f.action === "error") { log(`ERROR: ${f.path} — ${f.reason}`); return { status: "error", reason: f.reason }; }
    const tag = dryRun ? "[DRY-RUN]" : "[APPLY]";
    log(`${tag} ${f.action}: ${path.relative(plan.project ? "" : ".", f.path)} (${f.reason})`);

    if (dryRun) continue;

    try {
      if (f.action === "copy" || f.action === "replace") {
        if (f.action === "replace") {
          fs.copyFileSync(f.path, f.path + BACKUP_SUFFIX);
        }
        // dest dir 確認 (copy の場合 hook dir は既存だが念のため)
        fs.mkdirSync(path.dirname(f.path), { recursive: true });
        fs.copyFileSync(f.src, f.path);
      } else if (f.action === "patch") {
        const current = JSON.parse(fs.readFileSync(f.path, "utf8"));
        current.hooks = current.hooks || {};
        current.hooks.PostToolUse = Array.isArray(current.hooks.PostToolUse) ? current.hooks.PostToolUse : [];
        // backup
        fs.copyFileSync(f.path, f.path + BACKUP_SUFFIX);
        // append missing matchers
        for (const m of f._missingMatchers) current.hooks.PostToolUse.push(m);
        // atomic write
        const tmp = f.path + ".tmp." + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + "\n", "utf8");
        fs.renameSync(tmp, f.path);
      }
    } catch (e) {
      log(`ERROR during ${f.action}: ${e.message}`);
      return { status: "error", reason: e.message };
    }
  }
  return { status: dryRun ? "would-apply" : "applied", changes: plan.files.length };
}

function rollback(project) {
  const log = msg => console.log(`  [${project.name}] ${msg}`);
  const hooksDir   = path.join(project.path, ".claude", "claudeos", "scripts", "hooks");
  const settingsFn = path.join(project.path, ".claude", "settings.json");
  const targets = [
    path.join(hooksDir, "agent-teams-tracker.js"),
    path.join(hooksDir, "session-start.js"),
    settingsFn,
  ];
  let restored = 0;
  for (const t of targets) {
    const backup = t + BACKUP_SUFFIX;
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, t);
      fs.unlinkSync(backup);
      log(`restored: ${path.basename(t)}`);
      restored += 1;
    }
    // tracker.js は新規 (no backup) の場合 backup が無い → delete することで rollback
    if (path.basename(t) === "agent-teams-tracker.js" && !fs.existsSync(backup) && fs.existsSync(t)) {
      // backup が無い ＝ 新規配置だった → 削除
      fs.unlinkSync(t);
      log(`removed new file: ${path.basename(t)}`);
      restored += 1;
    }
  }
  return restored > 0 ? { status: "rolled-back", restored } : { status: "no-backup" };
}

// ──────────────────────────────────────────────────────────────────────
// main
// ──────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));

  // canonical source 存在確認
  for (const [name, p] of Object.entries(SOURCE_FILES)) {
    if (!fs.existsSync(p)) {
      console.error(`ERROR: canonical source missing: ${name} → ${p}`);
      process.exit(4);
    }
  }

  let projects = loadRegisteredProjects(args.configPath);
  if (args.projectFilter) {
    projects = projects.filter(p => p.name === args.projectFilter);
    if (projects.length === 0) {
      console.error(`ERROR: project not found: ${args.projectFilter}`);
      process.exit(5);
    }
  }

  // self exclude: 本プロジェクト自身はスキップ (既に適用済)
  const selfName = path.basename(process.cwd());
  projects = projects.filter(p => p.name !== selfName);

  console.log(`[discovery] found ${projects.length} projects (self "${selfName}" excluded)`);
  if (projects.length === 0) { console.log("Nothing to do."); return; }

  console.log("");
  const results = [];
  for (const project of projects) {
    if (args.mode === "rollback") {
      results.push(rollback(project));
    } else {
      const plan = computePlan(project);
      results.push(applyPlan(plan, args.mode === "dry-run"));
    }
  }

  console.log("");
  console.log("─".repeat(60));
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(`Summary: ${Object.entries(summary).map(([k,v]) => `${k}=${v}`).join("  ")}`);
}

main();
