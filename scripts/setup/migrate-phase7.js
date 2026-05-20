#!/usr/bin/env node
// Phase 7D: 既存登録プロジェクトの .mcp.json に Phase 7A (MCP alwaysLoad) を migration する
//
// 背景:
// - TemplateSyncManager の Initialize-ProjectTemplate は init-only (既存ファイルがあると上書きしない)
// - そのため .mcp.json への Phase 7A 変更は新規プロジェクトには配布されるが、
//   既存登録プロジェクトには永遠に届かない
// - 本 script で各登録プロジェクトの .mcp.json を読み取り、alwaysLoad 設定を差分マージする
//
// 対象 MCP server: github / memory / context7 (sequential-thinking は除外)
//
// 安全性:
// - 冪等 (何回実行しても結果が同じ)
// - 差分マージ (既存のユーザカスタマイズを保持)
// - バックアップ作成 (*.bak-phase7)
// - --dry-run で実行前プレビュー
// - --rollback でバックアップから復元
//
// 使い方:
//   node scripts/setup/migrate-phase7.js --dry-run                # 全登録プロジェクトの差分プレビュー
//   node scripts/setup/migrate-phase7.js --apply                  # 全登録プロジェクトへ適用
//   node scripts/setup/migrate-phase7.js --apply --project ProjA  # 個別プロジェクトのみ適用
//   node scripts/setup/migrate-phase7.js --rollback               # 全プロジェクトを *.bak-phase7 から復元

const fs = require("fs");
const path = require("path");

const ALWAYS_LOAD_SERVERS = ["github", "memory", "context7"];
const BACKUP_SUFFIX = ".bak-phase7";

function parseArgs(argv) {
  const args = {
    mode: null, // 'dry-run' | 'apply' | 'rollback'
    projectFilter: null,
    configPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.mode = "dry-run";
    else if (a === "--apply") args.mode = "apply";
    else if (a === "--rollback") args.mode = "rollback";
    else if (a === "--project") args.projectFilter = argv[++i];
    else if (a === "--config") args.configPath = argv[++i];
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    }
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
Phase 7 migration script — distributes Phase 7A (MCP alwaysLoad) to existing registered projects.

Usage:
  node scripts/setup/migrate-phase7.js --dry-run                # preview diffs
  node scripts/setup/migrate-phase7.js --apply                  # apply to all projects
  node scripts/setup/migrate-phase7.js --apply --project NAME   # apply to specific project
  node scripts/setup/migrate-phase7.js --rollback               # restore from *.bak-phase7

Options:
  --config <path>   Path to config.json (default: ./config.json)
  --project <name>  Filter by project name
`);
}

function expandUserPath(p) {
  if (!p) return p;
  return p.replace(/^%USERPROFILE%/i, process.env.USERPROFILE || process.env.HOME || "");
}

function discoverProjectsFromWindowsConfig(cfg) {
  // Windows: config/config.json + recent-projects.json + projectsDir scan
  const projectsDir = cfg.projectsDir;
  if (!projectsDir) {
    console.error("ERROR: config.json has no projectsDir");
    return [];
  }

  const seen = new Set();
  const projects = [];

  // Strategy A: recent-projects.json から名前を取り projectsDir 配下を確認
  const historyFile = expandUserPath(
    (cfg.recentProjects && cfg.recentProjects.historyFile) || ""
  );
  if (historyFile && fs.existsSync(historyFile)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
      for (const entry of history.projects || []) {
        if (!entry.project || seen.has(entry.project)) continue;
        seen.add(entry.project);
        const projectPath = path.join(projectsDir, entry.project);
        if (!fs.existsSync(projectPath)) continue;
        if (!fs.existsSync(path.join(projectPath, ".mcp.json"))) continue;
        projects.push({ name: entry.project, path: projectPath, _source: "recent" });
      }
    } catch (e) {
      console.error(`WARN: failed to parse ${historyFile}: ${e.message}`);
    }
  }

  // Strategy B (fallback): projectsDir 直下を scan
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (seen.has(e.name)) continue;
      const projectPath = path.join(projectsDir, e.name);
      if (!fs.existsSync(path.join(projectPath, ".mcp.json"))) continue;
      seen.add(e.name);
      projects.push({ name: e.name, path: projectPath, _source: "scan" });
    }
  } catch (e) {
    if (process.env.MIGRATE_PHASE7_DEBUG) {
      console.error(`[debug] scan ${projectsDir} failed: ${e.message}`);
    }
  }

  return projects;
}

function discoverProjectsFromLinuxConfig(cfg) {
  // Linux: config/linux-projects.json with basePath + projects array
  const basePath = cfg.basePath;
  if (!basePath) {
    console.error("ERROR: linux-projects.json has no basePath");
    return [];
  }

  const seen = new Set();
  const projects = [];

  // Strategy A: linux-projects.json の projects 配列から名前を取得
  for (const name of cfg.projects || []) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const projectPath = path.join(basePath, name);
    if (!fs.existsSync(projectPath)) continue;
    if (!fs.existsSync(path.join(projectPath, ".mcp.json"))) continue;
    projects.push({ name, path: projectPath, _source: "linux-registry" });
  }

  // Strategy B (fallback): basePath 直下も scan
  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (seen.has(e.name)) continue;
      const projectPath = path.join(basePath, e.name);
      if (!fs.existsSync(path.join(projectPath, ".mcp.json"))) continue;
      seen.add(e.name);
      projects.push({ name: e.name, path: projectPath, _source: "scan" });
    }
  } catch (e) {
    if (process.env.MIGRATE_PHASE7_DEBUG) {
      console.error(`[debug] scan ${basePath} failed: ${e.message}`);
    }
  }

  return projects;
}

function loadRegisteredProjects(configPath) {
  // Auto-detect: try explicit --config, then Windows config.json, then Linux linux-projects.json
  const candidates = configPath
    ? [configPath]
    : [
        path.join(process.cwd(), "config", "config.json"),
        path.join(process.cwd(), "config", "linux-projects.json"),
      ];

  let cfgPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { cfgPath = c; break; }
  }

  if (!cfgPath) {
    console.error(`WARN: no config file found. Tried: ${candidates.join(", ")}`);
    return [];
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  } catch (e) {
    console.error(`ERROR: failed to parse ${cfgPath}: ${e.message}`);
    process.exit(3);
  }

  console.log(`[discovery] using config: ${cfgPath}`);

  // Format detection: linux-projects.json has "basePath" + "projects" array
  // Windows config.json has "projectsDir" + "recentProjects"
  if (cfg.basePath && Array.isArray(cfg.projects)) {
    return discoverProjectsFromLinuxConfig(cfg);
  }
  if (cfg.projectsDir) {
    return discoverProjectsFromWindowsConfig(cfg);
  }

  console.error(`ERROR: ${cfgPath} has neither basePath+projects (Linux) nor projectsDir (Windows)`);
  return [];
}

function loadMcp(projectPath) {
  const mcpPath = path.join(projectPath, ".mcp.json");
  if (!fs.existsSync(mcpPath)) return { mcpPath, content: null, missing: true };
  try {
    const content = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    return { mcpPath, content, missing: false };
  } catch (e) {
    return { mcpPath, content: null, error: e.message };
  }
}

function computeMigration(content) {
  // alwaysLoad: true をセットすべき server を列挙し、必要な変更を返す
  if (!content || typeof content !== "object" || !content.mcpServers) {
    return { changes: [], skipped: true, reason: "no mcpServers section" };
  }
  const changes = [];
  for (const name of ALWAYS_LOAD_SERVERS) {
    const server = content.mcpServers[name];
    if (!server) continue;
    if (server.alwaysLoad === true) continue;
    changes.push({ server: name, action: "set alwaysLoad: true" });
  }
  return { changes, skipped: false };
}

function applyMigration(content) {
  for (const name of ALWAYS_LOAD_SERVERS) {
    const server = content.mcpServers[name];
    if (!server) continue;
    if (server.alwaysLoad === true) continue;
    // alwaysLoad を先頭に挿入したいため、新しい object を作る
    const reordered = { alwaysLoad: true };
    for (const k of Object.keys(server)) {
      if (k !== "alwaysLoad") reordered[k] = server[k];
    }
    content.mcpServers[name] = reordered;
  }
  return content;
}

function backupFile(filePath) {
  const backupPath = filePath + BACKUP_SUFFIX;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function writeJsonPreserveStyle(filePath, content) {
  // 2-space indent + trailing newline (project convention)
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n", "utf8");
}

function processProject(project, mode) {
  const { mcpPath, content, missing, error } = loadMcp(project.path);
  const log = (msg) => console.log(`  [${project.name}] ${msg}`);

  if (missing) {
    log(`SKIP: ${mcpPath} does not exist`);
    return { project: project.name, status: "skipped", reason: "no .mcp.json" };
  }
  if (error) {
    log(`ERROR: failed to parse .mcp.json: ${error}`);
    return { project: project.name, status: "error", reason: error };
  }

  if (mode === "rollback") {
    const backupPath = mcpPath + BACKUP_SUFFIX;
    if (!fs.existsSync(backupPath)) {
      log(`SKIP: no backup at ${backupPath}`);
      return { project: project.name, status: "skipped", reason: "no backup" };
    }
    fs.copyFileSync(backupPath, mcpPath);
    log(`RESTORED from ${backupPath}`);
    return { project: project.name, status: "rolled-back" };
  }

  const migration = computeMigration(content);
  if (migration.skipped) {
    log(`SKIP: ${migration.reason}`);
    return { project: project.name, status: "skipped", reason: migration.reason };
  }
  if (migration.changes.length === 0) {
    log(`OK: already migrated (alwaysLoad set on all eligible servers)`);
    return { project: project.name, status: "unchanged" };
  }

  log(`changes (${migration.changes.length}):`);
  migration.changes.forEach((c) => log(`  - ${c.server}: ${c.action}`));

  if (mode === "dry-run") {
    return { project: project.name, status: "would-change", changes: migration.changes };
  }

  // apply
  const backupPath = backupFile(mcpPath);
  log(`backup → ${backupPath}`);
  const updated = applyMigration(content);
  writeJsonPreserveStyle(mcpPath, updated);
  log(`APPLIED`);
  return { project: project.name, status: "applied", changes: migration.changes };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projects = loadRegisteredProjects(args.configPath);
  if (projects.length === 0) {
    console.log("No registered projects found. Exiting.");
    process.exit(0);
  }

  const targets = args.projectFilter
    ? projects.filter((p) => p.name === args.projectFilter)
    : projects;

  if (targets.length === 0) {
    console.error(`ERROR: no project matched filter "${args.projectFilter}"`);
    console.error(`Available projects: ${projects.map((p) => p.name).join(", ")}`);
    process.exit(4);
  }

  console.log(`Phase 7 migration mode: ${args.mode}`);
  console.log(`Target projects (${targets.length}):`);
  targets.forEach((p) => console.log(`  - ${p.name} @ ${p.path}`));
  console.log();

  const results = targets.map((p) => processProject(p, args.mode));

  console.log();
  console.log(`=== Summary (${args.mode}) ===`);
  const byStatus = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  Object.entries(byStatus).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  const errorCount = byStatus.error || 0;
  process.exit(errorCount > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  computeMigration,
  applyMigration,
  ALWAYS_LOAD_SERVERS,
  BACKUP_SUFFIX,
};
