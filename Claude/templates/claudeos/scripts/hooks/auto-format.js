#!/usr/bin/env node
/**
 * auto-format.js (ClaudeOS v8.2.4+) — PostToolUse(Edit|Write) hook
 *
 * Claude Code が編集 / 書き出ししたファイルに対して、拡張子別に formatter を適用する。
 * fail-soft: formatter 未インストールでも hook を壊さず、エラーログだけ吐いて 0 で抜ける。
 *
 * 対応:
 *   .js .ts .tsx .jsx .json .md .css .html → prettier
 *   .py                                    → ruff format（無ければ black）
 *   .go                                    → gofmt -w
 *   .rs                                    → rustfmt
 *   その他                                  → スキップ
 *
 * 環境変数:
 *   CLAUDEOS_DISABLE_AUTOFORMAT=1 で全停止（ユーザ希望時の緊急避難）
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
  const rel = filePath;

  if (PRETTIER_EXTS.has(ext)) {
    // npx 経由なら node_modules/.bin の prettier を優先
    const args = ["-y", "prettier", "--write", "--log-level", "error", rel];
    const res = spawnSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
    return { formatter: "prettier", ok: res.status === 0, stderr: (res.stderr || "").trim() };
  }

  if (ext === ".py") {
    if (which("ruff")) {
      const res = spawnSync("ruff", ["format", rel], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
      return { formatter: "ruff", ok: res.status === 0, stderr: (res.stderr || "").trim() };
    }
    if (which("black")) {
      const res = spawnSync("black", ["-q", rel], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
      return { formatter: "black", ok: res.status === 0, stderr: (res.stderr || "").trim() };
    }
    return { formatter: "python", ok: false, stderr: "no ruff/black available" };
  }

  if (ext === ".go") {
    if (which("gofmt")) {
      const res = spawnSync("gofmt", ["-w", rel], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
      return { formatter: "gofmt", ok: res.status === 0, stderr: (res.stderr || "").trim() };
    }
    return { formatter: "go", ok: false, stderr: "no gofmt" };
  }

  if (ext === ".rs") {
    if (which("rustfmt")) {
      const res = spawnSync("rustfmt", [rel], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
      return { formatter: "rustfmt", ok: res.status === 0, stderr: (res.stderr || "").trim() };
    }
    return { formatter: "rust", ok: false, stderr: "no rustfmt" };
  }

  return null; // not handled
}

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input || "{}");
    const toolInput = hookData.tool_input || hookData.input || {};
    const filePath = toolInput.file_path || toolInput.path;

    if (!filePath || !fs.existsSync(filePath)) { process.exit(0); }
    // 巨大ファイルはスキップ（formatter 暴走防止）
    try {
      if (fs.statSync(filePath).size > 2 * 1024 * 1024) { process.exit(0); }
    } catch { process.exit(0); }

    const result = runFormatter(filePath);
    if (!result) { process.exit(0); }
    if (result.ok) {
      console.log(`[AutoFormat] ${result.formatter}: ${path.basename(filePath)}`);
    } else if (process.env.CLAUDEOS_DEBUG) {
      console.error(`[AutoFormat] ${result.formatter} failed: ${result.stderr.slice(0, 200)}`);
    }
  } catch (err) {
    if (process.env.CLAUDEOS_DEBUG) console.error(`[AutoFormat] hook error: ${err.message}`);
  }
  process.exit(0);
});

if (process.stdin.isTTY) { process.exit(0); }
