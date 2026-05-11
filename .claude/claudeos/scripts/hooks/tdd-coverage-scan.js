#!/usr/bin/env node
/**
 * tdd-coverage-scan.js (ClaudeOS v8.2.3+)
 * 「変更されたソースに対応するテストファイルが存在するか」を粗く検査し、
 * 未テスト変更が見つかれば state.warnings へ kind="tdd_required" を追記する。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC_EXTS = new Set([".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rb", ".rs", ".java", ".cs", ".php"]);
const TEST_PATTERNS = {
  ".js":  (p, b) => [`${b}.test.js`, `${b}.spec.js`, path.join("__tests__", `${b}.js`), path.join("tests", `${b}.test.js`)],
  ".ts":  (p, b) => [`${b}.test.ts`, `${b}.spec.ts`, path.join("__tests__", `${b}.ts`), path.join("tests", `${b}.test.ts`)],
  ".tsx": (p, b) => [`${b}.test.tsx`, `${b}.spec.tsx`],
  ".jsx": (p, b) => [`${b}.test.jsx`, `${b}.spec.jsx`],
  ".py":  (p, b) => [`test_${b}.py`, path.join("tests", `test_${b}.py`), `${b}_test.py`],
  ".go":  (p, b) => [`${b}_test.go`],
  ".rb":  (p, b) => [path.join("spec", `${b}_spec.rb`), `${b}_spec.rb`, `${b}_test.rb`],
  ".rs":  (p, b) => [path.join("tests", `${b}.rs`)],
  ".java":(p, b) => [path.join("src", "test", "java", `${b}Test.java`)],
  ".cs":  (p, b) => [`${b}Tests.cs`, `${b}.Tests.cs`],
  ".php": (p, b) => [`${b}Test.php`, path.join("tests", `${b}Test.php`)],
};

const EXCLUDE_DIRS = ["node_modules", "vendor", ".git", "dist", "build", "out", "coverage", "reports", ".worktrees"];
const EXCLUDE_BASENAMES = ["index", "main", "cli", "bin"];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function changedFiles(cwd) {
  try {
    const out = execSync("git diff --name-only HEAD~5..HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString();
    return out.split("\n").map(l => l.trim()).filter(Boolean);
  } catch { return []; }
}

function isExcluded(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.some(p => EXCLUDE_DIRS.includes(p))) return true;
  if (/\.test\.|\.spec\.|__tests__|_test\.go$|_spec\.rb$/.test(rel)) return true;
  const base = path.basename(rel, path.extname(rel));
  if (EXCLUDE_BASENAMES.includes(base)) return true;
  return false;
}

function hasTest(cwd, srcRel) {
  const ext = path.extname(srcRel);
  const base = path.basename(srcRel, ext);
  const dir = path.dirname(srcRel);
  const patterns = (TEST_PATTERNS[ext] || (() => []))(srcRel, base);
  for (const p of patterns) {
    const candidates = [
      path.join(cwd, dir, p),
      path.join(cwd, p),
    ];
    if (candidates.some(c => fs.existsSync(c))) return true;
  }
  return false;
}

function scan(cwd) {
  const files = changedFiles(cwd);
  const untested = [];
  for (const f of files) {
    if (isExcluded(f)) continue;
    if (!SRC_EXTS.has(path.extname(f))) continue;
    const abs = path.join(cwd, f);
    if (!fs.existsSync(abs)) continue;
    if (!hasTest(cwd, f)) untested.push(f);
  }
  return untested;
}

function main() {
  const cwd = process.cwd();
  const stateFile = path.join(cwd, "state.json");
  const state = readJson(stateFile);
  if (!state) {
    console.log("[tdd-coverage-scan] state.json not found — skip");
    process.exit(0);
  }

  const untested = scan(cwd);
  if (untested.length === 0) {
    console.log("[tdd-coverage-scan] all recently changed source files have tests");
    process.exit(0);
  }

  state.warnings = state.warnings || [];
  state.warnings.push({
    at: new Date().toISOString(),
    kind: "tdd_required",
    message: `テスト未整備の変更が ${untested.length} 件あります。/tdd または tdd-guide agent で対応してください。`,
    files: untested.slice(0, 30),
    truncated: untested.length > 30,
  });
  writeJsonAtomic(stateFile, state);
  console.log(`[tdd-coverage-scan][WARN] untested changes: ${untested.length}`);
  for (const f of untested.slice(0, 10)) console.log(`  - ${f}`);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { scan, hasTest, isExcluded };
