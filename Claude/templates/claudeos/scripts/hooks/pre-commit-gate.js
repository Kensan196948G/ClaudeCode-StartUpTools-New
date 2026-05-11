#!/usr/bin/env node
/**
 * pre-commit-gate.js (ClaudeOS v8.2.4+) — PreToolUse(Bash) hook
 *
 * Bash ツールで `git commit` を実行しようとした場合に、lint と簡易テストを先に走らせ、
 * 失敗していれば commit をブロックする（exit 1）。
 *
 * 環境変数:
 *   CLAUDEOS_SKIP_PRECOMMIT=1 → 強制スキップ（緊急 hotfix 等）
 *
 * 実行内容:
 *   1. scripts/lint/lint-and-fix.js --no-fix を実行 → reports/lint-summary.json を更新
 *   2. lint summary が errors > 0 を含むならブロック
 *   3. package.json に "test:quick" script があれば実行（無ければスキップ）
 *
 * 設計判断:
 *   - lint warning では止めない（quality_gate_check が次セッション開始時に拾う）
 *   - test:quick は **任意**（プロジェクト固有）。フルテストは Verify ループでやる
 *   - hook 失敗時もエラーメッセージを stderr に出して理由を残す
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

if (process.env.CLAUDEOS_SKIP_PRECOMMIT === "1") {
  console.error("[PreCommitGate] skipped via CLAUDEOS_SKIP_PRECOMMIT=1");
  process.exit(0);
}

let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input || "{}");
    const toolName  = (hookData.tool_name || hookData.tool || "").toLowerCase();
    const toolInput = hookData.tool_input || hookData.input || {};
    const cmd       = String(toolInput.command || "");

    // Bash ツール以外、または git commit 以外はスルー
    if (toolName !== "bash") { process.exit(0); }
    // "git commit", "git -c ... commit", "/usr/bin/git commit" を許容
    if (!/(^|[\s;&|`(])git(\s+-\S+)*\s+commit\b/.test(cmd)) { process.exit(0); }
    // --no-verify が含まれていればユーザの明示的バイパス → スルー
    if (/--no-verify\b/.test(cmd)) {
      console.error("[PreCommitGate] --no-verify detected; skipping gate");
      process.exit(0);
    }

    const cwd = process.cwd();
    const linter = path.join(cwd, "scripts", "lint", "lint-and-fix.js");
    if (!fs.existsSync(linter)) { process.exit(0); }

    console.error("[PreCommitGate] running lint...");
    const lintRes = spawnSync("node", [linter, "--no-fix"], { cwd, stdio: "inherit", timeout: 90000 });
    if (lintRes.status !== 0) {
      console.error("[PreCommitGate] lint runner failed; allowing commit (fail-soft)");
    }

    // lint summary が errors > 0 なら blocking
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
      } catch { /* JSON 壊れ → スルー */ }
    }

    // test:quick が定義されていれば実行
    const pkgFile = path.join(cwd, "package.json");
    if (fs.existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
        if (pkg.scripts && pkg.scripts["test:quick"]) {
          console.error("[PreCommitGate] running npm run test:quick...");
          const t = spawnSync("npm", ["run", "--silent", "test:quick"], { cwd, stdio: "inherit", timeout: 120000, shell: process.platform === "win32" });
          if (t.status !== 0) {
            console.error("[PreCommitGate] BLOCKED: test:quick failed");
            process.exit(1);
          }
        }
      } catch { /* package.json 壊れ → スルー */ }
    }

    console.error("[PreCommitGate] OK");
  } catch (err) {
    console.error(`[PreCommitGate] hook error (fail-soft): ${err.message}`);
  }
  process.exit(0);
});

if (process.stdin.isTTY) { process.exit(0); }
