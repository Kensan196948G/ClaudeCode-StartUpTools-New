#!/usr/bin/env node
/**
 * pre-commit-gate.js (ClaudeOS v8.2.4+) — PreToolUse(Bash) hook
 * git commit を検知して lint + test:quick を実行、errors > 0 ならブロック。
 * CLAUDEOS_SKIP_PRECOMMIT=1 で全停止、--no-verify 検知でもスキップ。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
if (process.env.CLAUDEOS_SKIP_PRECOMMIT === "1") { console.error("[PreCommitGate] skipped via env"); process.exit(0); }
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input || "{}");
    const toolName = (hookData.tool_name || hookData.tool || "").toLowerCase();
    const cmd = String((hookData.tool_input || hookData.input || {}).command || "");
    if (toolName !== "bash") process.exit(0);
    if (!/(^|[\s;&|`(])git(\s+-\S+)*\s+commit\b/.test(cmd)) process.exit(0);
    if (/--no-verify\b/.test(cmd)) { console.error("[PreCommitGate] --no-verify; skip"); process.exit(0); }
    const cwd = process.cwd();
    const linter = path.join(cwd, "scripts", "lint", "lint-and-fix.js");
    if (!fs.existsSync(linter)) process.exit(0);
    console.error("[PreCommitGate] running lint...");
    spawnSync("node", [linter, "--no-fix"], { cwd, stdio: "inherit", timeout: 90000 });
    const summaryFile = path.join(cwd, "reports", "lint-summary.json");
    if (fs.existsSync(summaryFile)) {
      try {
        const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
        const errs = Number(summary.errors || 0);
        if (errs > 0) {
          console.error(`[PreCommitGate] BLOCKED: lint errors=${errs}`);
          console.error("                Fix errors or set CLAUDEOS_SKIP_PRECOMMIT=1 to bypass");
          process.exit(1);
        }
      } catch {}
    }
    const pkgFile = path.join(cwd, "package.json");
    if (fs.existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
        if (pkg.scripts && pkg.scripts["test:quick"]) {
          console.error("[PreCommitGate] running npm run test:quick...");
          const t = spawnSync("npm", ["run", "--silent", "test:quick"], { cwd, stdio: "inherit", timeout: 120000, shell: process.platform === "win32" });
          if (t.status !== 0) { console.error("[PreCommitGate] BLOCKED: test:quick failed"); process.exit(1); }
        }
      } catch {}
    }
    console.error("[PreCommitGate] OK");
  } catch (err) {
    console.error(`[PreCommitGate] hook error (fail-soft): ${err.message}`);
  }
  process.exit(0);
});
if (process.stdin.isTTY) process.exit(0);
