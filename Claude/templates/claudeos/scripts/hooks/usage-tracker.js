#!/usr/bin/env node
// PostToolUse hook (ClaudeOS v8.2) — P1-7 / v8.2.2 skill tracking
// Agent / Skill ツール呼び出しを検出し、learning.usage_history へ使用実績を記録する。
// settings.json の PostToolUse で matcher: "Agent|Skill" として登録する。

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(process.cwd(), "state.json");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function recordAgent(state, toolInput) {
  const subagentType = toolInput.subagent_type || "general-purpose";
  const description  = (toolInput.description || "").slice(0, 80);
  const agentKey     = subagentType.replace(/[^a-zA-Z0-9_-]/g, "_");

  state.learning = state.learning || {};
  state.learning.usage_history = state.learning.usage_history || {};
  const agents = state.learning.usage_history.agents = state.learning.usage_history.agents || {};
  const now = new Date().toISOString();

  if (!agents[agentKey]) {
    agents[agentKey] = { call_count: 0, last_used: null, last_description: "" };
  }
  agents[agentKey].call_count += 1;
  agents[agentKey].last_used = now;
  if (description) agents[agentKey].last_description = description;
  agents._total_agent_calls = (agents._total_agent_calls || 0) + 1;
  agents._last_agent_call_at = now;
  return { kind: "agent", key: agentKey, count: agents[agentKey].call_count };
}

function recordSkill(state, toolInput) {
  const rawName = toolInput.skill || toolInput.skill_name || toolInput.name || "";
  if (!rawName) return null;
  const skillKey = String(rawName).replace(/[^a-zA-Z0-9_:.\-]/g, "_");
  const argsPreview = (toolInput.args ? String(toolInput.args) : "").slice(0, 80);

  state.learning = state.learning || {};
  state.learning.usage_history = state.learning.usage_history || {};
  const skills = state.learning.usage_history.skills = state.learning.usage_history.skills || {};
  const now = new Date().toISOString();

  if (!skills[skillKey]) {
    skills[skillKey] = { call_count: 0, last_used: null, last_args_preview: "" };
  }
  skills[skillKey].call_count += 1;
  skills[skillKey].last_used = now;
  if (argsPreview) skills[skillKey].last_args_preview = argsPreview;
  skills._total_skill_calls = (skills._total_skill_calls || 0) + 1;
  skills._last_skill_call_at = now;
  return { kind: "skill", key: skillKey, count: skills[skillKey].call_count };
}

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input);
    const toolName  = hookData.tool_name || hookData.tool || "";
    const toolInput = hookData.tool_input || hookData.input || {};
    const lower = toolName.toLowerCase();

    const state = readJson(STATE_FILE);
    if (!state) { process.exit(0); }

    let result = null;
    if (lower.includes("agent")) {
      result = recordAgent(state, toolInput);
    } else if (lower === "skill") {
      result = recordSkill(state, toolInput);
    } else {
      process.exit(0);
    }

    writeJsonAtomic(STATE_FILE, state);
    if (result) console.log(`[UsageTracker] ${result.kind}=${result.key} total_calls=${result.count}`);
  } catch (err) {
    console.error(`[UsageTracker] error: ${err.message}`);
  }
  process.exit(0);
});

if (process.stdin.isTTY) { process.exit(0); }
