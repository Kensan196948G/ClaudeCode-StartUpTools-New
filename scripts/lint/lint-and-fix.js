#!/usr/bin/env node
/**
 * scripts/lint/lint-and-fix.js (ClaudeOS v8.2.3+)
 *
 * プロジェクト全体の lint を実行し、安全な範囲で --fix を適用してから、
 * 残った warning / error を reports/lint-summary.json に書き出す。
 *
 * 検出: package.json / .eslintrc* / pyproject.toml / ruff.toml / go.mod の存在
 *
 * 戦略:
 *   1. lint を実行（--fix 無し）→ before カウント取得
 *   2. --fix を実行（unsafe rule は除外）→ 自動修正適用
 *   3. lint を再実行 → after カウント取得
 *   4. before/after の差分と remaining を reports/lint-summary.json に出力
 *   5. exit code は常に 0（fail-soft）。CI gate は別途 quality-gate-check.js が判定
 *
 * 使い方:
 *   node scripts/lint/lint-and-fix.js                # cwd プロジェクト全体
 *   node scripts/lint/lint-and-fix.js --no-fix       # 検査のみ（修正適用なし）
 *   node scripts/lint/lint-and-fix.js --dry          # 結果を stdout に印字、ファイル書き出し無し
 *
 * 既定で除外する unsafe ルール（ESLint）:
 *   - no-unused-vars (自動削除は意図破壊リスク)
 *   - prefer-const   (let→const は破壊的変更扱い)
 *
 *   これらは `--fix-type suggestion,layout` で安全側に限定することで実質回避する。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const args = process.argv.slice(2);
const argMap = { fix: true, dry: false };
for (const a of args) {
  if (a === "--no-fix") argMap.fix = false;
  if (a === "--dry") argMap.dry = true;
}

const PROJECT_DIR = process.cwd();
const REPORTS_DIR = path.join(PROJECT_DIR, "reports");
const OUT_FILE    = path.join(REPORTS_DIR, "lint-summary.json");

function fileExists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function anyExists(...candidates) { return candidates.some(c => fileExists(path.join(PROJECT_DIR, c))); }

function detectLinters() {
  const linters = [];
  if (anyExists("package.json") && (
       anyExists(".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.cjs")
    || hasEslintInPackage()
  )) {
    linters.push("eslint");
  }
  if (anyExists("pyproject.toml", "ruff.toml", ".ruff.toml")) linters.push("ruff");
  if (anyExists("go.mod")) linters.push("golangci-lint");
  return linters;
}

function hasEslintInPackage() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "package.json"), "utf8"));
    return !!(pkg.devDependencies && pkg.devDependencies.eslint) ||
           !!(pkg.dependencies && pkg.dependencies.eslint) ||
           !!(pkg.eslintConfig);
  } catch { return false; }
}

function runEslint({ fix }) {
  const fixArgs = fix ? ["--fix", "--fix-type", "suggestion,layout"] : [];
  const args = ["eslint", ".", "--format", "json", "--no-error-on-unmatched-pattern", ...fixArgs];
  const res = spawnSync("npx", ["-y", ...args], { cwd: PROJECT_DIR, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  // ESLint は違反があると exit 1 になるので stdout は信頼する
  let errors = 0, warnings = 0;
  try {
    const json = JSON.parse(res.stdout || "[]");
    for (const file of json) {
      errors   += file.errorCount   || 0;
      warnings += file.warningCount || 0;
    }
  } catch (_) {
    return { linter: "eslint", errors: null, warnings: null, parse_error: true, stderr: (res.stderr || "").slice(0, 500) };
  }
  return { linter: "eslint", errors, warnings };
}

function runRuff({ fix }) {
  const fixArgs = fix ? ["--fix"] : [];
  const res = spawnSync("ruff", ["check", ".", "--output-format", "json", ...fixArgs],
    { cwd: PROJECT_DIR, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  let errors = 0, warnings = 0;
  try {
    const json = JSON.parse(res.stdout || "[]");
    // ruff の severity は明示されないので件数のみ集計（全件 warning 扱い）
    warnings = json.length;
  } catch (_) {
    return { linter: "ruff", errors: null, warnings: null, parse_error: true, stderr: (res.stderr || "").slice(0, 500) };
  }
  return { linter: "ruff", errors, warnings };
}

function runGolangci({ fix }) {
  const fixArgs = fix ? ["--fix"] : [];
  const res = spawnSync("golangci-lint", ["run", "--out-format", "json", ...fixArgs],
    { cwd: PROJECT_DIR, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  let errors = 0, warnings = 0;
  try {
    const json = JSON.parse(res.stdout || "{}");
    const issues = (json.Issues || []);
    warnings = issues.length;
  } catch (_) {
    return { linter: "golangci-lint", errors: null, warnings: null, parse_error: true, stderr: (res.stderr || "").slice(0, 500) };
  }
  return { linter: "golangci-lint", errors, warnings };
}

const RUNNERS = { eslint: runEslint, ruff: runRuff, "golangci-lint": runGolangci };

function execute(linters, fix) {
  const results = [];
  for (const name of linters) {
    const runner = RUNNERS[name];
    if (!runner) continue;
    results.push(runner({ fix }));
  }
  return results;
}

function aggregate(results) {
  const totals = { errors: 0, warnings: 0, parse_errors: 0 };
  for (const r of results) {
    if (r.parse_error) { totals.parse_errors += 1; continue; }
    totals.errors   += Number(r.errors   || 0);
    totals.warnings += Number(r.warnings || 0);
  }
  return totals;
}

function main() {
  const linters = detectLinters();
  if (linters.length === 0) {
    console.log("[lint-and-fix] no supported linter detected — skip");
    process.exit(0);
  }
  console.log(`[lint-and-fix] detected: ${linters.join(", ")}`);

  const before = execute(linters, false);
  const beforeTotals = aggregate(before);
  console.log(`[lint-and-fix] before: errors=${beforeTotals.errors} warnings=${beforeTotals.warnings}`);

  let afterTotals = beforeTotals;
  let after = before;
  if (argMap.fix) {
    execute(linters, true);
    after = execute(linters, false);
    afterTotals = aggregate(after);
    console.log(`[lint-and-fix] after:  errors=${afterTotals.errors} warnings=${afterTotals.warnings}`);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    linters,
    errors: afterTotals.errors,
    warnings: afterTotals.warnings,
    parse_errors: afterTotals.parse_errors,
    delta: {
      errors:   beforeTotals.errors   - afterTotals.errors,
      warnings: beforeTotals.warnings - afterTotals.warnings,
    },
    per_linter: after,
  };

  if (argMap.dry) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log(`[lint-and-fix] wrote ${path.relative(PROJECT_DIR, OUT_FILE)}`);
}

if (require.main === module) main();

module.exports = { detectLinters, runEslint, runRuff, runGolangci };
