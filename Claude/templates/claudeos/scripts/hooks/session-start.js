#!/usr/bin/env node
// SessionStart hook (ClaudeOS v9.0)
// 起動時に state.json を読み、前回セッションの再開ヒントを表示する。
// v9.0: 週次フェーズ計算・KPI 詳細・blocked_issues 表示を追加。
// current_session_start_at を書き込み、セッション追跡を確立する。

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

// v9.0: 週次フェーズを start_date から計算する
function calcWeekPhase(startDate) {
  if (!startDate) return null;
  const start = Date.parse(startDate);
  if (isNaN(start)) return null;
  const weeks = Math.floor((Date.now() - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
  if (weeks <= 8)  return { week: weeks, phase: "Build",      focus: "実装優先 / Agent Teams パターン A" };
  if (weeks <= 16) return { week: weeks, phase: "Quality",    focus: "テスト・レビュー強化 / パターン B" };
  if (weeks <= 20) return { week: weeks, phase: "Stabilize",  focus: "新機能凍結 / CI 安定化のみ" };
  return           { week: weeks, phase: "Release",           focus: "変更最小化 / セキュリティ最終確認" };
}

const state = readJson(STATE_FILE);
if (!state) {
  console.log("[SessionStart] state.json not found — fresh session");
  process.exit(0);
}

const exec    = state.execution || {};
const stable  = state.stable || {};
const token   = state.token || {};
const compact = state.compact || {};
const kpi     = state.kpi || {};
const project = state.project || {};

console.log("[SessionStart] ClaudeOS v9.0 resume context");
console.log(`  phase: ${exec.phase || "unknown"}`);
console.log(`  last_summary: ${exec.last_session_summary || "(none)"}`);
console.log(`  stable_achieved: ${stable.stable_achieved ? "yes" : "no"}`);
console.log(`  consecutive_success: ${stable.consecutive_success ?? 0}`);
console.log(
  `  token: used=${token.used ?? 0}% / remaining=${token.remaining ?? 100}%`
);
console.log(`  last_pre_compact_at: ${compact.last_pre_compact_at || "(never)"}`);

// v9.0: KPI サマリー
if (kpi.ci_success_rate !== undefined || kpi.blocker_count !== undefined) {
  console.log(
    `  kpi: ci_success=${kpi.ci_success_rate ?? "n/a"} test_pass=${kpi.test_pass_rate ?? "n/a"} security_critical=${kpi.security_critical ?? 0} blockers=${kpi.blocker_count ?? 0}`
  );
}

// v9.0: blocked_issues サマリー
const blocked = state.blocked_issues || [];
if (blocked.length > 0) {
  console.log(`  blocked_issues: ${blocked.map(b => (typeof b === "object" ? b.issue || b : b)).join(", ")}`);
}

// v9.0: 週次フェーズ表示
const wp = calcWeekPhase(project.start_date);
if (wp) {
  console.log(`  week_phase: Week ${wp.week} → ${wp.phase} (${wp.focus})`);
}

// state.json に current_session_start_at を書き込む
try {
  const now = new Date().toISOString();
  state.execution = exec;
  state.execution.current_session_start_at = now;

  // cron 起動の場合は trigger を記録（CLAUDE_SESSION_ID env var が存在する）
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
  // 書き込み失敗は無視（表示は完了しているため）
  console.error(`[SessionStart] state.json write failed: ${err.message}`);
}

// Stage 3: ReasoningBank — 関連パターンをセッション開始時に注入（fail-soft）
// state.json 書き込み完了後に実行するため、最新のフェーズ・要約を参照できる。
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
