#!/usr/bin/env node
/**
 * install-mcp.js (ClaudeOS v8.2+)
 *
 * mcp-servers.json (カタログ) と state.json.mcp.enabled[] を読み、
 * プロジェクト直下に .mcp.json を生成する。
 *
 * 使い方:
 *   node scripts/setup/install-mcp.js                   # cwd プロジェクトに適用
 *   node scripts/setup/install-mcp.js --project /path   # 指定プロジェクトに適用
 *   node scripts/setup/install-mcp.js --dry             # 出力先を変えず stdout に印字
 *
 * 設計判断:
 *   - 既存 .mcp.json があれば「カタログ生成分」を mcpServers にマージ。
 *     ユーザ手作業のエントリは保持する（カタログに同名が無いもの）。
 *   - env / headers 内の ${VAR} は展開しない（Claude Code 側で実行時展開される想定）。
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry") argMap.dry = true;
  else if (a === "--project") argMap.project = args[++i];
}

const PROJECT_DIR = path.resolve(argMap.project || process.cwd());
const CATALOG_FILE = path.resolve(__dirname, "..", "..", "Claude", "templates", "claudeos", "mcp-configs", "mcp-servers.json");
const STATE_FILE   = path.join(PROJECT_DIR, "state.json");
const OUT_FILE     = path.join(PROJECT_DIR, ".mcp.json");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function toMcpEntry(server) {
  if (server.transport === "http" || server.transport === "sse") {
    return {
      type: server.transport,
      url: server.url,
      ...(server.headers ? { headers: server.headers } : {}),
    };
  }
  // stdio (default)
  return {
    type: "stdio",
    command: server.command,
    args: server.args || [],
    ...(server.env && Object.keys(server.env).length ? { env: server.env } : {}),
  };
}

function resolveEnabled(catalog, state) {
  const allByName = new Map(catalog.servers.map(s => [s.name, s]));
  const enabledList = ((state && state.mcp && state.mcp.enabled) || null);
  if (enabledList && Array.isArray(enabledList)) {
    return enabledList
      .map(name => allByName.get(name))
      .filter(Boolean);
  }
  return catalog.servers.filter(s => s.default_enabled);
}

function main() {
  const catalog = readJson(CATALOG_FILE);
  if (!catalog || !Array.isArray(catalog.servers)) {
    console.error(`[install-mcp] catalog not found or invalid: ${CATALOG_FILE}`);
    process.exit(2);
  }
  const state = readJson(STATE_FILE);
  const selected = resolveEnabled(catalog, state);

  const existing = readJson(OUT_FILE) || {};
  const existingMap = (existing.mcpServers && typeof existing.mcpServers === "object")
    ? Object.assign({}, existing.mcpServers) : {};

  const generated = {};
  for (const srv of selected) {
    generated[srv.name] = toMcpEntry(srv);
  }

  // マージ: カタログ生成分が既存と同名なら上書き。それ以外（手作業エントリ）は保持。
  const merged = Object.assign({}, existingMap, generated);
  const out = { mcpServers: merged };

  if (argMap.dry) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`[install-mcp] wrote ${OUT_FILE}`);
  console.log(`[install-mcp] enabled: ${Object.keys(generated).join(", ") || "(none)"}`);
  if (Object.keys(merged).length > Object.keys(generated).length) {
    const preserved = Object.keys(merged).filter(k => !(k in generated));
    console.log(`[install-mcp] preserved user entries: ${preserved.join(", ")}`);
  }
}

if (require.main === module) main();

module.exports = { resolveEnabled, toMcpEntry };
