#!/usr/bin/env node
/**
 * scripts/dashboards/render.js (ClaudeOS v8.2+)
 *
 * Claude/templates/claudeos/dashboards/*.md のテンプレート（{{placeholder}} 形式）に
 * state.json + Git status の値を埋め、reports/dashboards/*.md として書き出す。
 *
 * 使い方:
 *   node scripts/dashboards/render.js                # cwd プロジェクトに適用
 *   node scripts/dashboards/render.js --project /path
 *   node scripts/dashboards/render.js --dry          # stdout に印字のみ
 *
 * 設計判断:
 *   - テンプレートは絶対に書き換えない（編集中の差分を奪わない）
 *   - 出力先は reports/dashboards/ （reports/ は既に gitignore で扱い済み）
 *   - 値が無い placeholder は "?" で埋める（テンプレートを壊さない）
 *   - improve-loop の Output として呼び出される想定
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const argMap = { project: process.cwd(), dry: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry") argMap.dry = true;
  else if (a === "--project") argMap.project = path.resolve(args[++i]);
}

const PROJECT_DIR    = argMap.project;
const TEMPLATE_DIR   = path.resolve(__dirname, "..", "..", "Claude", "templates", "claudeos", "dashboards");
const OUT_DIR        = path.join(PROJECT_DIR, "reports", "dashboards");
const STATE_FILE     = path.join(PROJECT_DIR, "state.json");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function safeGit(cmd) {
  try { return execSync(cmd, { cwd: PROJECT_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

function buildContext(state) {
  const exec = state.execution || {};
  const stable = state.stable || {};
  const project = state.project || {};
  const goal = state.goal || {};
  const usage = (state.learning || {}).usage_history || {};
  const agents = usage.agents || {};
  const skills = usage.skills || {};

  const startMs = exec.current_session_start_at ? Date.parse(exec.current_session_start_at) : null;
  const nowMs = Date.now();
  const elapsedMin = startMs ? Math.floor((nowMs - startMs) / 60000) : null;
  const maxMin = exec.max_duration_minutes || 300;
  const remainingMin = elapsedMin != null ? Math.max(0, maxMin - elapsedMin) : null;
  const sessionPct = elapsedMin != null ? Math.min(100, Math.floor(elapsedMin / maxMin * 100)) : null;

  const fmtMin = (m) => (m == null ? "?" : `${Math.floor(m / 60)}h${m % 60}m`);
  const fmtBool = (v) => (v ? "yes" : "no");

  const branch = safeGit("git rev-parse --abbrev-ref HEAD");
  const headSha = safeGit("git rev-parse --short HEAD");
  const dirty = safeGit("git status --porcelain") ? "dirty" : "clean";

  const warnings = state.warnings || [];
  const lastWarn = warnings.length ? warnings[warnings.length - 1] : null;

  // Top agent/skill by call_count（"_total_*" 等のメタキーは除外）
  const topOf = (obj) => {
    let topKey = null, topCount = -1;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_")) continue;
      const c = (v && v.call_count) || 0;
      if (c > topCount) { topKey = k; topCount = c; }
    }
    return topKey ? `${topKey} (${topCount})` : "none";
  };

  const agentCalls = (key) => String((agents[key] && agents[key].call_count) || 0);

  // Risk derivation
  const riskWarnings = warnings.length > 5 ? "high" : warnings.length > 0 ? "medium" : "low";
  const riskCi = exec.last_ci_result === "fail" ? "high" : "low";
  const riskSecurity = warnings.some(w => w.kind && w.kind.includes("security")) ? "high" : "low";

  // Token / time status (heuristic — exact token usage is not in state.json yet)
  let tokenStatus = "safe";
  let tokenRecommendation = "Normal: Continue";
  if (sessionPct != null) {
    if (sessionPct >= 95) { tokenStatus = "critical"; tokenRecommendation = "Critical: Safe Shutdown"; }
    else if (sessionPct >= 70) { tokenStatus = "warning"; tokenRecommendation = "Warning: Verify Priority"; }
  }
  const timeStatus = remainingMin == null ? "?" : remainingMin < 15 ? "STOP" : remainingMin < 30 ? "WARNING" : "OK";
  const stop5h = remainingMin != null && remainingMin <= 0 ? "yes" : "no";

  return {
    // project / goal
    project_name: path.basename(PROJECT_DIR),
    goal_title: goal.title || "?",
    project_phase_mode: project.phase_mode || "development",
    project_cron_enabled: fmtBool(project.cron_enabled),
    project_release_deadline: project.release_deadline || "?",
    project_sync_state: dirty === "clean" ? "ok" : "ng",

    // execution / session
    exec_phase: exec.phase || "?",
    exec_summary: exec.last_session_summary || "(no summary)",
    exec_trigger: exec.last_trigger || "?",
    session_start_at: exec.current_session_start_at || "?",
    session_end_planned: exec.session_end_planned_at || "?",
    elapsed_hm: fmtMin(elapsedMin),
    remaining_hm: fmtMin(remainingMin),
    session_progress_pct: sessionPct != null ? `${sessionPct}%` : "?",
    time_status: timeStatus,
    stop_5h: stop5h,

    // stable
    stable_consecutive: String(stable.consecutive_success || 0),
    stable_target_n: String(stable.target_n || 3),
    stable_target_n_reason: stable.target_n_reason || "?",
    stable_achieved: fmtBool(stable.stable_achieved),
    stable_last_pr: stable.stable_achieved_pr ? `#${stable.stable_achieved_pr}` : "—",

    // ci
    ci_last_result: exec.last_ci_result || "?",
    ci_retry_count: String(exec.auto_repair_retry_count || 0),
    ci_auto_repair_state: exec.auto_repair_state || "inactive",

    // agents
    agent_total_calls: String(agents._total_agent_calls || 0),
    agent_top: topOf(agents),
    agent_cto_calls: agentCalls("cto"),
    agent_architect_calls: agentCalls("architect"),
    agent_developer_calls: agentCalls("developer"),
    agent_qa_calls: agentCalls("qa"),
    agent_security_calls: agentCalls("security-reviewer") !== "0" ? agentCalls("security-reviewer") : agentCalls("security"),
    agent_devops_calls: agentCalls("devops") !== "0" ? agentCalls("devops") : agentCalls("ops"),
    agent_reviewer_calls: agentCalls("code-reviewer") !== "0" ? agentCalls("code-reviewer") : agentCalls("reviewer"),

    // skills
    skill_total_calls: String(skills._total_skill_calls || 0),
    skill_top: topOf(skills),

    // warnings / risk
    warning_count: String(warnings.length),
    warning_latest: lastWarn ? `${lastWarn.kind}: ${(lastWarn.message || "").slice(0, 120)}` : "none",
    risk_warnings: riskWarnings,
    risk_ci: riskCi,
    risk_security: riskSecurity,

    // git
    git_branch: branch || "?",
    git_head: headSha || "?",
    git_dirty: dirty,

    // token (heuristic until real telemetry lands)
    token_session_used: "?",
    token_session_remaining: "?",
    token_session_pct: sessionPct != null ? `${sessionPct}%` : "?",
    token_status: tokenStatus,
    token_budget_mode: process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ? "managed" : "default",
    token_autocompact_pct: process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE || "auto",
    token_recommendation: tokenRecommendation,

    // next action
    next_action: exec.next_action || exec.last_session_summary || "(no summary)",
  };
}

function render(tpl, ctx) {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    if (key in ctx) return ctx[key];
    return "?";
  });
}

function main() {
  const state = readJson(STATE_FILE);
  if (!state) {
    console.error(`[render-dashboards] state.json not found: ${STATE_FILE}`);
    process.exit(2);
  }
  const ctx = buildContext(state);
  ctx._generated_at = new Date().toISOString();

  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error(`[render-dashboards] template dir not found: ${TEMPLATE_DIR}`);
    process.exit(3);
  }

  const files = fs.readdirSync(TEMPLATE_DIR).filter(f => f.endsWith(".md"));
  if (!argMap.dry) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const f of files) {
    const src = fs.readFileSync(path.join(TEMPLATE_DIR, f), "utf8");
    const header = `<!-- Generated by scripts/dashboards/render.js at ${ctx._generated_at} -->\n\n`;
    const rendered = header + render(src, ctx);
    if (argMap.dry) {
      console.log(`===== ${f} =====`);
      console.log(rendered);
    } else {
      const out = path.join(OUT_DIR, f);
      fs.writeFileSync(out, rendered, "utf8");
      console.log(`[render-dashboards] wrote ${path.relative(PROJECT_DIR, out)}`);
    }
  }
}

if (require.main === module) main();

module.exports = { buildContext, render };
