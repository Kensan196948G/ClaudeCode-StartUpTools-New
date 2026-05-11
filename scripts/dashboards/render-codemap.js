#!/usr/bin/env node
/**
 * scripts/dashboards/render-codemap.js (ClaudeOS v8.2.4+)
 *
 * プロジェクトのアーキテクチャ図・依存関係図・ディレクトリ構造・Agent 起動チェーンを
 * mermaid 形式で docs/architecture/*.md に生成する。
 *
 * 使い方:
 *   node scripts/dashboards/render-codemap.js                  # 全ターゲット
 *   node scripts/dashboards/render-codemap.js --target deps    # 個別
 *   node scripts/dashboards/render-codemap.js --dry            # stdout のみ
 *
 * 設計判断:
 *   - 言語別パッケージ依存解析は package.json / go.mod / pyproject.toml の **直接依存のみ**
 *     （transitive は爆発するし、PR レビューで使えなくなる）
 *   - ディレクトリツリーは深さ 2 まで（ルート + 直下サブディレクトリ）。それ以上は noise。
 *   - Agent 起動チェーンは CLAUDE.md §6 の表をテキスト解析せず、本スクリプト内に定数で保持
 *     （ドキュメントとコードを分離。CLAUDE.md 編集とコード更新を並列に進められる）
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const opts = { dry: false, target: "all" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry") opts.dry = true;
  else if (a === "--target") opts.target = args[++i];
}

const cwd = process.cwd();
const OUT_DIR = path.join(cwd, "docs", "architecture");

function safeGit(cmd) {
  try { return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }

function header(title) {
  return `# ${title}\n\n> 自動生成: \`scripts/dashboards/render-codemap.js\`\n> 生成日時: ${new Date().toISOString()}\n\n`;
}

// ──────────────────────────────────────────────
// overview
// ──────────────────────────────────────────────
function buildOverview() {
  const lines = [];
  lines.push(header("System Architecture Overview"));
  lines.push("```mermaid");
  lines.push("flowchart TB");
  lines.push("  subgraph Client[User / Cron]");
  lines.push("    CLI[Claude Code CLI]");
  lines.push("    CRON[Linux cron-launcher.sh]");
  lines.push("  end");
  lines.push("  subgraph Orchestration[ClaudeOS Orchestration]");
  lines.push("    ORCH[orchestrator agent]");
  lines.push("    CTO[CTO agent]");
  lines.push("    ARCH[architect]");
  lines.push("    DEV[developer]");
  lines.push("    QA[qa]");
  lines.push("    SEC[security-reviewer]");
  lines.push("    REV[code-reviewer]");
  lines.push("    DEVOPS[devops]");
  lines.push("  end");
  lines.push("  subgraph External[External Tools]");
  lines.push("    GH[GitHub MCP]");
  lines.push("    CR[CodeRabbit]");
  lines.push("    CODEX[Codex review]");
  lines.push("    CI[GitHub Actions]");
  lines.push("  end");
  lines.push("  subgraph State[State Layer]");
  lines.push("    SJ[state.json]");
  lines.push("    RB[reasoning-bank.json]");
  lines.push("    WARN[state.warnings]");
  lines.push("    REP[reports/]");
  lines.push("  end");
  lines.push("  CLI --> CTO");
  lines.push("  CRON --> CLI");
  lines.push("  CTO --> ORCH");
  lines.push("  ORCH --> ARCH & DEV & QA & SEC & REV & DEVOPS");
  lines.push("  DEV --> GH");
  lines.push("  REV --> CR & CODEX");
  lines.push("  DEVOPS --> CI");
  lines.push("  ORCH --> SJ");
  lines.push("  CTO --> RB");
  lines.push("  QA --> WARN");
  lines.push("  DEVOPS --> REP");
  lines.push("```");
  return lines.join("\n");
}

// ──────────────────────────────────────────────
// dependencies
// ──────────────────────────────────────────────
function buildDeps() {
  const lines = [];
  lines.push(header("Package Dependencies"));

  const pkg = readJson(path.join(cwd, "package.json"));
  if (pkg) {
    lines.push("## Node.js (package.json)");
    lines.push("");
    lines.push("```mermaid");
    lines.push("graph LR");
    const name = pkg.name || "project";
    lines.push(`  P[${name}]`);
    for (const [d, v] of Object.entries(pkg.dependencies || {})) {
      const id = d.replace(/[^A-Za-z0-9]/g, "_");
      lines.push(`  P --> ${id}["${d}@${v}"]`);
    }
    for (const [d, v] of Object.entries(pkg.devDependencies || {})) {
      const id = d.replace(/[^A-Za-z0-9]/g, "_") + "_dev";
      lines.push(`  P -.->|dev| ${id}["${d}@${v}"]`);
    }
    lines.push("```");
    lines.push("");
  }

  // go.mod
  const goMod = path.join(cwd, "go.mod");
  if (fs.existsSync(goMod)) {
    const content = fs.readFileSync(goMod, "utf8");
    const requires = [...content.matchAll(/^\s*([^\s]+)\s+v[\d.]+/gm)].map(m => m[1]).filter(m => m.includes("."));
    if (requires.length) {
      lines.push("## Go (go.mod)");
      lines.push("");
      lines.push("```mermaid");
      lines.push("graph LR");
      lines.push(`  P[module]`);
      for (const r of requires.slice(0, 30)) {
        const id = r.replace(/[^A-Za-z0-9]/g, "_");
        lines.push(`  P --> ${id}["${r}"]`);
      }
      lines.push("```");
      lines.push("");
    }
  }

  if (lines.length <= 3) {
    lines.push("_対応するパッケージマニフェストが見つかりませんでした。_");
  }
  return lines.join("\n");
}

// ──────────────────────────────────────────────
// directory tree
// ──────────────────────────────────────────────
function buildDirs() {
  const lines = [];
  lines.push(header("Directory Structure (depth 2)"));
  lines.push("```mermaid");
  lines.push("graph LR");
  lines.push("  ROOT((/))");
  let topLevels = [];
  try {
    topLevels = fs.readdirSync(cwd).filter(n => !n.startsWith(".") && fs.statSync(path.join(cwd, n)).isDirectory());
  } catch { /* empty */ }
  for (const d of topLevels) {
    const id1 = d.replace(/[^A-Za-z0-9]/g, "_");
    lines.push(`  ROOT --> ${id1}[${d}/]`);
    let subs = [];
    try {
      subs = fs.readdirSync(path.join(cwd, d)).filter(n => !n.startsWith(".") && fs.statSync(path.join(cwd, d, n)).isDirectory()).slice(0, 6);
    } catch { /* empty */ }
    for (const s of subs) {
      const id2 = `${id1}_${s.replace(/[^A-Za-z0-9]/g, "_")}`;
      lines.push(`  ${id1} --> ${id2}[${s}/]`);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

// ──────────────────────────────────────────────
// agent chain
// ──────────────────────────────────────────────
const AGENT_CHAIN = {
  Monitor:     ["CTO", "ProductManager", "Analyst", "Architect", "DevOps"],
  Development: ["Architect", "Developer", "Reviewer"],
  Verify:      ["QA", "Reviewer", "Security", "DevOps", "e2e-runner", "security-reviewer"],
  Repair:      ["Debugger", "Developer", "Reviewer", "QA", "DevOps"],
  Improvement: ["EvolutionManager", "ProductManager", "Architect", "Developer", "QA"],
  Release:     ["ReleaseManager", "Reviewer", "Security", "DevOps", "CTO"],
};

function buildAgentChain() {
  const lines = [];
  lines.push(header("Agent Activation Chain (per Phase)"));
  for (const [phase, agents] of Object.entries(AGENT_CHAIN)) {
    lines.push(`## ${phase}`);
    lines.push("");
    lines.push("```mermaid");
    lines.push("sequenceDiagram");
    lines.push(`  participant U as User`);
    for (const a of agents) lines.push(`  participant ${a.replace(/[^A-Za-z0-9]/g, "_")} as ${a}`);
    let prev = "U";
    for (const a of agents) {
      const id = a.replace(/[^A-Za-z0-9]/g, "_");
      lines.push(`  ${prev}->>${id}: invoke`);
      prev = id;
    }
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

// ──────────────────────────────────────────────
const TARGETS = {
  overview: { file: "overview.md", build: buildOverview },
  deps:     { file: "dependencies.md", build: buildDeps },
  dirs:     { file: "directory.md", build: buildDirs },
  agents:   { file: "agent-chain.md", build: buildAgentChain },
};

function main() {
  const wanted = opts.target === "all" ? Object.keys(TARGETS) : [opts.target];
  if (!opts.dry) fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const key of wanted) {
    const t = TARGETS[key];
    if (!t) { console.error(`[render-codemap] unknown target: ${key}`); continue; }
    const content = t.build();
    if (opts.dry) {
      console.log(`===== ${t.file} =====`);
      console.log(content);
    } else {
      const out = path.join(OUT_DIR, t.file);
      fs.writeFileSync(out, content + "\n", "utf8");
      console.log(`[render-codemap] wrote ${path.relative(cwd, out)}`);
    }
  }
}

if (require.main === module) main();
module.exports = { buildOverview, buildDeps, buildDirs, buildAgentChain };
