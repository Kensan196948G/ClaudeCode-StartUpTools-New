#!/usr/bin/env node
// PostToolUse hook (ClaudeOS v9.0)
// Agent Teams (TeamCreate / SendMessage) の使用を state.json に記録する。
//
// 設計方針:
//  - experimental API のため tool_input の構造変化に強い fail-soft 設計
//  - 失敗しても exit 0 で抜け、Claude 本体のフローを止めない
//  - state.json への書き込みは atomic (.tmp.pid + rename) で session-start.js と整合
//  - 既存 usage-tracker.js (matcher: "Agent") とは独立して並列稼働

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(process.cwd(), "state.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

// hook 入力を stdin から取得（Claude Code hook 仕様）
function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseHookInput(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// フェーズから推定パターン (A/B/C) を返す
function estimatePattern(phase) {
  const p = (phase || "").toLowerCase();
  if (p.includes("build") || p.includes("development")) return "A";
  if (p.includes("verify") || p.includes("quality") || p.includes("repair")) return "B";
  if (p.includes("monitor") || p.includes("research") || p.includes("design")) return "C";
  return null;
}

// 履歴 entry の最大保持件数（古いものから FIFO で削除）
const HISTORY_MAX = 50;

function main() {
  const raw   = readStdin();
  const input = parseHookInput(raw);

  // tool_name / tool_input の取得（仕様変化に備えて複数キー試行）
  const toolName  = input.tool_name || input.toolName || (input.tool && input.tool.name) || "";
  const toolInput = input.tool_input || input.toolInput || (input.tool && input.tool.input) || {};

  // 対象 tool でなければ何もしない
  if (toolName !== "TeamCreate" && toolName !== "SendMessage") {
    process.exit(0);
  }

  const state = readJson(STATE_FILE);
  if (!state) {
    console.log(`[agent-teams-tracker] state.json not found — skip`);
    process.exit(0);
  }

  // agent_teams_usage 構造を初期化（既存があれば temp 引継ぎ）
  if (!state.agent_teams_usage) {
    state.agent_teams_usage = {
      session_start_at: state.execution?.current_session_start_at || new Date().toISOString(),
      current_session: { team_create_count: 0, send_message_count: 0, teammates: [], patterns_used: [] },
      history: [],
    };
  }
  if (!state.agent_teams_usage.current_session) {
    state.agent_teams_usage.current_session = { team_create_count: 0, send_message_count: 0, teammates: [], patterns_used: [] };
  }
  if (!Array.isArray(state.agent_teams_usage.history)) {
    state.agent_teams_usage.history = [];
  }

  // 新しいセッション開始の検出 (current_session_start_at が変わっていれば current_session を rotate)
  const sessionStartAt = state.execution?.current_session_start_at;
  if (sessionStartAt && state.agent_teams_usage.session_start_at !== sessionStartAt) {
    const prev = state.agent_teams_usage.current_session;
    if (prev && (prev.team_create_count > 0 || prev.send_message_count > 0)) {
      state.agent_teams_usage.history.push({
        date: (state.agent_teams_usage.session_start_at || "").slice(0, 10),
        session_start_at: state.agent_teams_usage.session_start_at,
        team_create_count: prev.team_create_count,
        send_message_count: prev.send_message_count,
        patterns_used: prev.patterns_used || [],
        teammates_count: (prev.teammates || []).length,
      });
      if (state.agent_teams_usage.history.length > HISTORY_MAX) {
        state.agent_teams_usage.history = state.agent_teams_usage.history.slice(-HISTORY_MAX);
      }
    }
    state.agent_teams_usage.session_start_at = sessionStartAt;
    state.agent_teams_usage.current_session  = { team_create_count: 0, send_message_count: 0, teammates: [], patterns_used: [] };
  }

  const cur = state.agent_teams_usage.current_session;
  const now = new Date().toISOString();

  if (toolName === "TeamCreate") {
    cur.team_create_count = (cur.team_create_count || 0) + 1;
    const teamName  = toolInput.name || toolInput.team_name || "(unnamed)";
    const teammates = Array.isArray(toolInput.teammates) ? toolInput.teammates : [];
    teammates.forEach((tm) => {
      const entry = {
        team:           teamName,
        name:           tm.name || tm.subagent_type || "(unknown)",
        subagent_type:  tm.subagent_type || tm.agent || "",
        spawned_at:     now,
      };
      cur.teammates.push(entry);
    });
    const pattern = estimatePattern(state.phase || state.execution?.phase);
    if (pattern && !cur.patterns_used.includes(pattern)) {
      cur.patterns_used.push(pattern);
    }
    console.log(`[agent-teams-tracker] TeamCreate recorded: team="${teamName}" teammates=${teammates.length} pattern=${pattern || "n/a"}`);
  } else if (toolName === "SendMessage") {
    cur.send_message_count = (cur.send_message_count || 0) + 1;
    const target = toolInput.to || toolInput.target || "(unknown)";
    console.log(`[agent-teams-tracker] SendMessage recorded: to="${target}" total=${cur.send_message_count}`);
  }

  cur.last_activity_at = now;

  try {
    writeJsonAtomic(STATE_FILE, state);
  } catch (err) {
    console.error(`[agent-teams-tracker] state.json write failed: ${err.message}`);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`[agent-teams-tracker] unexpected error: ${err.message}`);
  process.exit(0);
}
