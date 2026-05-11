#!/usr/bin/env node
/**
 * agent-transcript.js (ClaudeOS v8.2.5+) — PostToolUse(Agent) hook
 * SubAgent 起動時の prompt と結果を Markdown ファイルに時系列記録する。
 * 出力先: reports/agent-transcripts/<session-date>.md
 */
"use strict";
const fs = require("fs");
const path = require("path");
if (process.env.CLAUDEOS_DISABLE_TRANSCRIPT === "1") process.exit(0);
const MAX_BYTES = Number(process.env.CLAUDEOS_TRANSCRIPT_MAX_BYTES || 200000);

const AGENT_ICONS = {
  cto: "👔", architect: "🏛️", developer: "💻", qa: "🧪",
  security: "🔒", "security-reviewer": "🔒",
  reviewer: "🔍", "code-reviewer": "🔍",
  debugger: "🐛", devops: "⚙️", ops: "⚙️",
  analyst: "📊", productmanager: "📋", "product-manager": "📋",
  evolutionmanager: "🧬", releasemanager: "🚀", "release-manager": "🚀",
  "performance-reviewer": "⚡", "e2e-runner": "🎭", "tdd-guide": "🧪",
  explore: "🔭", "general-purpose": "🤖", "claude-code-guide": "📘", plan: "🗺️",
};

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function iconOf(n) { return AGENT_ICONS[String(n || "").toLowerCase()] || "🤖"; }
function truncate(s, max) {
  if (typeof s !== "string") s = JSON.stringify(s ?? "");
  if (Buffer.byteLength(s, "utf8") <= max) return s;
  return s.slice(0, max) + `\n\n_…(truncated, ${Buffer.byteLength(s, "utf8") - max} bytes omitted)_`;
}

function sessionFile() {
  const cwd = process.cwd();
  const state = readJson(path.join(cwd, "state.json")) || {};
  const start = (state.execution || {}).current_session_start_at || new Date().toISOString();
  const safe = start.replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(cwd, "reports", "agent-transcripts");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safe}.md`);
}

function ensureHeader(file) {
  if (fs.existsSync(file)) return;
  const cwd = process.cwd();
  const state = readJson(path.join(cwd, "state.json")) || {};
  const session = (state.execution || {}).current_session_start_at || "?";
  const phase   = (state.execution || {}).phase || "?";
  const goal    = (state.goal || {}).title || path.basename(cwd);
  const header = `# 🎬 Agent Transcripts

| 項目 | 値 |
|---|---|
| 📌 プロジェクト | ${goal} |
| 🕐 セッション開始 | ${session} |
| 🔁 フェーズ | ${phase} |
| 📁 生成元 | \`.claude/claudeos/scripts/hooks/agent-transcript.js\` |

> SubAgent (\`Agent\` tool) の呼び出しと応答を時系列で記録します。会話可視化のための「議事録」。

---

`;
  fs.writeFileSync(file, header, "utf8");
}

function appendEntry(file, entry) {
  ensureHeader(file);
  const block = [
    `## ${entry.icon} ${entry.agent} — ${entry.timestamp}`, "",
    `**📌 説明**: ${entry.description || "(no description)"}`, "",
    "### 📥 Prompt", "",
    "```", truncate(entry.prompt || "(empty)", MAX_BYTES), "```", "",
    "### 📤 Result", "",
    "```", truncate(entry.result || "(empty)", MAX_BYTES), "```", "",
    "---", "",
  ].join("\n");
  fs.appendFileSync(file, block, "utf8");
}

let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input || "{}");
    const toolName = (hookData.tool_name || hookData.tool || "").toLowerCase();
    if (!toolName.includes("agent")) process.exit(0);
    const toolInput  = hookData.tool_input  || hookData.input  || {};
    const toolResult = hookData.tool_response || hookData.tool_result || hookData.response || "";
    const agent = toolInput.subagent_type || "general-purpose";
    const entry = {
      timestamp: new Date().toISOString(),
      agent, icon: iconOf(agent),
      description: toolInput.description || "",
      prompt: toolInput.prompt || "",
      result: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult ?? "", null, 2),
    };
    const file = sessionFile();
    appendEntry(file, entry);
    console.log(`[AgentTranscript] ${entry.icon} ${entry.agent} → ${path.basename(file)}`);
  } catch (err) {
    if (process.env.CLAUDEOS_DEBUG) console.error(`[AgentTranscript] hook error: ${err.message}`);
  }
  process.exit(0);
});
if (process.stdin.isTTY) process.exit(0);
