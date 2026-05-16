#!/usr/bin/env node
/**
 * run-cmdb-scan.js — CMDB-Agent 実行スクリプト（ClaudeOS Phase 6D）
 * Monitor フェーズ末尾で呼び出し、構成アイテムの差分を reports/cmdb-YYYY-MM-DD.json に出力。
 */

"use strict";

const fs    = require("fs");
const path  = require("path");
const { spawnSync } = require("child_process");

const ROOT    = process.cwd();
const TODAY   = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "reports", "cmdb");
const OUT_FILE = path.join(OUT_DIR, `${TODAY}.json`);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return (r.stdout || "").trim();
}

// ── カテゴリ別ファイルカウント ─────────────────────────────────────────────

function countByGlob(patterns) {
  const seen = new Set();
  for (const pat of patterns) {
    const r = spawnSync("git", ["ls-files", `--`, pat], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    (r.stdout || "").split("\n").filter(Boolean).forEach(f => seen.add(f));
  }
  return seen.size;
}

function buildCIs() {
  return {
    application: {
      js_ts:    countByGlob(["*.js", "*.ts", "*.tsx", "*.jsx", "**/*.js", "**/*.ts"]),
      powershell: countByGlob(["*.ps1", "**/*.ps1"]),
      python:   countByGlob(["*.py", "**/*.py"]),
      shell:    countByGlob(["*.sh", "**/*.sh"]),
    },
    cicd: {
      workflows: countByGlob([".github/workflows/*.yml", ".github/workflows/*.yaml"]),
      hooks:     countByGlob([".claude/claudeos/scripts/hooks/*.js"]),
      scripts:   countByGlob(["scripts/**/*.js", "scripts/**/*.ps1", "scripts/**/*.sh"]),
    },
    config: {
      json:   countByGlob(["*.json", "**/*.json", "!node_modules/**"]),
      yaml:   countByGlob(["*.yml", "*.yaml", "**/*.yml"]),
      dotenv: countByGlob([".env*"]),
    },
    docs: {
      markdown: countByGlob(["*.md", "**/*.md"]),
      reports:  countByGlob(["reports/**"]),
    },
  };
}

// ── 外部依存関係 ───────────────────────────────────────────────────────────

function getExternalDeps() {
  const deps = {};
  const pkgFile = path.join(ROOT, "package.json");
  if (fs.existsSync(pkgFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      deps.npm = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length;
    } catch { deps.npm = 0; }
  }
  return deps;
}

// ── Git 変更差分（直近5コミット）─────────────────────────────────────────

function getRecentChanges() {
  const out = run("git", ["log", "--name-only", "--pretty=format:%H %s", "-5"]);
  const lines = out.split("\n");
  const commits = [];
  let current = null;
  for (const line of lines) {
    if (!line.trim()) { current = null; continue; }
    if (/^[0-9a-f]{40} /.test(line)) {
      current = { sha: line.slice(0, 8), message: line.slice(41, 100), files: [] };
      commits.push(current);
    } else if (current) {
      current.files.push(line.trim());
    }
  }
  return commits;
}

// ── メイン ─────────────────────────────────────────────────────────────────

function main() {
  console.log("=== CMDB-Agent スキャン ===");
  console.log(`対象: ${ROOT}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cis      = buildCIs();
  const deps     = getExternalDeps();
  const changes  = getRecentChanges();
  const branch   = run("git", ["branch", "--show-current"]) || "main";
  const lastTag  = run("git", ["describe", "--tags", "--abbrev=0"]) || "N/A";

  // 影響範囲サマリー（直近5コミットの変更ファイルを分類）
  const impactSummary = { cicd: [], config: [], application: [], docs: [] };
  for (const commit of changes) {
    for (const f of commit.files) {
      if (f.includes(".github/") || f.includes("hooks/") || f.includes("scripts/"))
        impactSummary.cicd.push(f);
      else if (f.endsWith(".json") || f.endsWith(".yml") || f.endsWith(".yaml"))
        impactSummary.config.push(f);
      else if (f.endsWith(".md"))
        impactSummary.docs.push(f);
      else
        impactSummary.application.push(f);
    }
  }

  const report = {
    generated_at:   new Date().toISOString(),
    project:        path.basename(ROOT),
    branch,
    last_tag:       lastTag,
    configuration_items: cis,
    external_dependencies: deps,
    recent_changes: changes,
    impact_summary: {
      cicd:        [...new Set(impactSummary.cicd)].length,
      config:      [...new Set(impactSummary.config)].length,
      application: [...new Set(impactSummary.application)].length,
      docs:        [...new Set(impactSummary.docs)].length,
    },
    cmdb_agent: "ClaudeOS CMDB-Agent Phase 6D",
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`\n構成アイテム:`);
  console.log(`  App: JS/TS=${cis.application.js_ts} PS1=${cis.application.powershell}`);
  console.log(`  CI/CD: workflows=${cis.cicd.workflows} hooks=${cis.cicd.hooks}`);
  console.log(`  Docs: markdown=${cis.docs.markdown}`);
  console.log(`\n影響範囲（直近5コミット）:`);
  console.log(`  CI/CD変更: ${report.impact_summary.cicd}件`);
  console.log(`  Config変更: ${report.impact_summary.config}件`);
  console.log(`  App変更:   ${report.impact_summary.application}件`);
  console.log(`  Docs変更:  ${report.impact_summary.docs}件`);
  console.log(`\n出力: ${OUT_FILE}`);

  console.log("\n[停止理由]\n- 状態: 完了\n- 理由: CMDB スキャン完了\n- 次アクション: Audit-Agent へ証跡を提供");
}

main();
