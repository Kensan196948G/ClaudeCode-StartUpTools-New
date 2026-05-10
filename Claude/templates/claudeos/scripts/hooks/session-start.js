#!/usr/bin/env node
// SessionStart hook (ClaudeOS v8.2)
// 起動時に state.json を読み、前回セッションの再開ヒントを表示する。
// また、current_session_start_at を書き込み、セッション追跡を確立する。
// /recap が利用できない環境での代替経路としても機能する。

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

const state = readJson(STATE_FILE);
if (!state) {
  console.log("[SessionStart] state.json not found — fresh session");
  process.exit(0);
}

const exec   = state.execution || {};
const stable = state.stable    || {};
const token  = state.token     || {};
const compact = state.compact  || {};

console.log("[SessionStart] ClaudeOS v8.2 resume context");
console.log(`  phase: ${exec.phase || "unknown"}`);
console.log(`  last_summary: ${exec.last_session_summary || "(none)"}`);
console.log(`  stable_achieved: ${stable.stable_achieved ? "yes" : "no"}`);
console.log(`  consecutive_success: ${stable.consecutive_success ?? 0}`);
console.log(`  token: used=${token.used ?? 0}% / remaining=${token.remaining ?? 100}%`);
console.log(`  last_pre_compact_at: ${compact.last_pre_compact_at || "(never)"}`);

// state.json に current_session_start_at を書き込む
try {
  const now = new Date().toISOString();
  state.execution = exec;
  state.execution.current_session_start_at = now;

  const cronSessionId = process.env.CLAUDE_SESSION_ID;
  if (cronSessionId) {
    state.execution.last_trigger = "cron";
    state.execution.last_cron_session_id = cronSessionId;
  } else {
    state.execution.last_trigger = "manual";
  }

  writeJsonAtomic(STATE_FILE, state);
  console.log(`  session_start_at: ${now}`);
  console.log(`  trigger: ${state.execution.last_trigger}`);
} catch (err) {
  console.error(`[SessionStart] state.json write failed: ${err.message}`);
}

// ReasoningBank — 関連パターンをセッション開始時に注入（fail-soft）
try {
  const rb      = require("./reasoning-bank.js");
  const dataDir = path.join(__dirname, "..", "..", "data");
  const bank    = rb.loadBank(dataDir);
  if (bank.entries.length > 0) {
    const projectName = path.basename(process.cwd());
    const phase       = exec.phase || "unknown";
    const summary     = exec.last_session_summary || "";
    const currentTags = rb.extractTags(summary);
    const patterns    = rb.retrieveRelevantPatterns(bank, projectName, phase, currentTags, 3);
    if (patterns.length > 0) {
      console.log("\n[ReasoningBank] 過去の有効パターン（参考）:");
      patterns.forEach((p, i) => {
        const confStr = (p.confidence || 0).toFixed(2);
        const tagsStr = (p.tags || []).slice(0, 4).join(",");
        console.log(`  [${i + 1}] conf=${confStr} | ${p.outcome} | phase=${p.phase} | tags=[${tagsStr}]`);
        console.log(`       問題: ${p.problem_pattern}`);
        const approachPreview = (p.approach || "").slice(0, 120);
        console.log(`       対応: ${approachPreview}${(p.approach || "").length > 120 ? "…" : ""}`);
      });
    }
  }
} catch (_rbErr) {
  // fail-soft: SessionStart フックをブロックしない
}

process.exit(0);
