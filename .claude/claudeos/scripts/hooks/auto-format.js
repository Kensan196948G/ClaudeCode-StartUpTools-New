#!/usr/bin/env node
/**
 * auto-format.js (ClaudeOS v8.2.4+) — PostToolUse(Edit|Write) hook
 * 拡張子別に formatter を適用。fail-soft。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
if (process.env.CLAUDEOS_DISABLE_AUTOFORMAT === "1") process.exit(0);
const PRETTIER_EXTS = new Set([".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".md", ".mdx", ".css", ".scss", ".html", ".yaml", ".yml"]);
function which(cmd) {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return probe.status === 0 && probe.stdout.trim();
}
function runFormatter(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (PRETTIER_EXTS.has(ext)) {
    const res = spawnSync("npx", ["-y", "prettier", "--write", "--log-level", "error", filePath], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
    return { formatter: "prettier", ok: res.status === 0, stderr: (res.stderr || "").trim() };
  }
  if (ext === ".py") {
    if (which("ruff")) { const r = spawnSync("ruff", ["format", filePath], { encoding: "utf8", timeout: 30000 }); return { formatter: "ruff", ok: r.status === 0, stderr: (r.stderr || "").trim() }; }
    if (which("black")) { const r = spawnSync("black", ["-q", filePath], { encoding: "utf8", timeout: 30000 }); return { formatter: "black", ok: r.status === 0, stderr: (r.stderr || "").trim() }; }
    return { formatter: "python", ok: false, stderr: "no ruff/black" };
  }
  if (ext === ".go" && which("gofmt")) { const r = spawnSync("gofmt", ["-w", filePath], { encoding: "utf8", timeout: 30000 }); return { formatter: "gofmt", ok: r.status === 0, stderr: (r.stderr || "").trim() }; }
  if (ext === ".rs" && which("rustfmt")) { const r = spawnSync("rustfmt", [filePath], { encoding: "utf8", timeout: 30000 }); return { formatter: "rustfmt", ok: r.status === 0, stderr: (r.stderr || "").trim() }; }
  return null;
}
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input || "{}");
    const filePath = (hookData.tool_input || hookData.input || {}).file_path || (hookData.tool_input || {}).path;
    if (!filePath || !fs.existsSync(filePath)) process.exit(0);
    try { if (fs.statSync(filePath).size > 2 * 1024 * 1024) process.exit(0); } catch { process.exit(0); }
    const result = runFormatter(filePath);
    if (!result) process.exit(0);
    if (result.ok) console.log(`[AutoFormat] ${result.formatter}: ${path.basename(filePath)}`);
    else if (process.env.CLAUDEOS_DEBUG) console.error(`[AutoFormat] ${result.formatter} failed: ${result.stderr.slice(0,200)}`);
  } catch (err) {
    if (process.env.CLAUDEOS_DEBUG) console.error(`[AutoFormat] hook error: ${err.message}`);
  }
  process.exit(0);
});
if (process.stdin.isTTY) process.exit(0);
