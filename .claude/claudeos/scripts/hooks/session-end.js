#!/usr/bin/env node
// Stop hook (ClaudeOS v8.2)
// セッション終了時に state.json を最終更新し、続けて notify-stable を同期実行する。
// 並列実行による state.json への race condition を避けるため、両者は単一 hook エントリに統合する。
// 失敗しても Stop hook をブロックしない fail-soft 設計。
//
// 実行順序: state.json 更新 → Webhook → notify-stable → Dreaming spawn
// Dreaming spawn は notify-stable の state.json 書き込みが完了してから行う。
// これにより dreaming runner が読む state.json に notify-stable の変更が反映される。

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
  // temp file へ書き込み → rename で atomic 置換。
  // 書き込み中の rip を防ぎ、並列読み込みからの競合を最小化する。
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

let dreamingEnabled = false;

try {
  const state = readJson(STATE_FILE);
  if (state) {
    state.execution = state.execution || {};
    state.execution.last_stop_at = new Date().toISOString();

    // Dreaming フィールド初期化（初回のみ）
    if (!state.dreaming) {
      state.dreaming = {
        patterns: [],
        curated_memories: [],
        recurring_mistakes: [],
        last_dreaming_run: null,
        dreaming_enabled: false,
      };
    }

    dreamingEnabled = !!state.dreaming.dreaming_enabled;

    // Verify フェーズで必須 SubAgent が起動されたかを検証する。
    // qa / security-reviewer / e2e-runner のいずれも当該セッションで呼ばれていない場合は警告。
    try {
      const exec = state.execution || {};
      const phase = exec.phase;
      if (phase === "Verify") {
        const sessionStart = exec.current_session_start_at;
        const agentHist = ((state.learning || {}).usage_history || {}).agents || {};
        const required = ["qa", "security-reviewer", "e2e-runner"];
        const startMs = sessionStart ? Date.parse(sessionStart) : 0;
        const launched = required.filter((k) => {
          const last = agentHist[k] && agentHist[k].last_used;
          return last && Date.parse(last) >= startMs;
        });
        if (launched.length === 0) {
          state.warnings = state.warnings || [];
          state.warnings.push({
            at: new Date().toISOString(),
            kind: "verify_subagent_missing",
            message: "Verify フェーズで qa / security-reviewer / e2e-runner SubAgent が一度も起動されませんでした。STABLE 判定の必要条件を満たしていない可能性があります。",
            phase,
            required,
          });
          console.log("[SessionEnd][WARN] Verify phase ended without required SubAgent invocation");
        }
      }
    } catch (verifyErr) {
      console.error(`[SessionEnd] verify-subagent-check failed: ${verifyErr.message}`);
    }

    // Quality gate: lint / coverage の閾値違反を state.warnings へ追記する。
    try {
      const qg = require("./quality-gate-check.js");
      const breaches = qg.evaluate(process.cwd(), state);
      if (qg.appendWarnings(state, breaches)) {
        console.log(`[SessionEnd][WARN] Quality gates breached: ${breaches.map(b => b.gate).join(", ")}`);
      }
    } catch (qgErr) {
      if (process.env.CLAUDEOS_DEBUG) console.error(`[SessionEnd] quality-gate skipped: ${qgErr.message}`);
    }

    // Deploy runbook auto-gen: state.deploy.ready=true なら手順書を生成する。
    try {
      if (state.deploy && state.deploy.ready) {
        const { spawnSync } = require("child_process");
        const script = path.join(process.cwd(), "scripts", "release", "generate-deploy-runbook.js");
        if (fs.existsSync(script)) {
          const r = spawnSync(process.execPath, [script], { cwd: process.cwd(), encoding: "utf8" });
          if (r.status === 0) console.log("[SessionEnd] deploy runbook generated (reports/deploy-runbook.md)");
        }
      }
    } catch (drErr) {
      if (process.env.CLAUDEOS_DEBUG) console.error(`[SessionEnd] deploy-runbook skipped: ${drErr.message}`);
    }

    // TDD coverage scan: 直近の変更ファイルに対応テストが無ければ warning 追加。
    try {
      const tdd = require("./tdd-coverage-scan.js");
      const untested = tdd.scan(process.cwd());
      if (untested.length > 0) {
        state.warnings = state.warnings || [];
        state.warnings.push({
          at: new Date().toISOString(),
          kind: "tdd_required",
          message: `テスト未整備の変更が ${untested.length} 件あります。/tdd または tdd-guide agent で対応してください。`,
          files: untested.slice(0, 30),
          truncated: untested.length > 30,
        });
        console.log(`[SessionEnd][WARN] tdd_required: ${untested.length} untested file(s)`);
      }
    } catch (tddErr) {
      if (process.env.CLAUDEOS_DEBUG) console.error(`[SessionEnd] tdd-scan skipped: ${tddErr.message}`);
    }

    // Conducted mode graceful shutdown: operation_mode.current === "conducted" の場合、
    // teammates snapshot の存在を確認し、last_snapshot_at を記録する。
    // teammates 配列自体はリード CTO がフェーズ遷移時に書き込む（hook からは live state を取得できない）。
    // ここでは「conducted モードで session 終了するのに teammates が空 = リード CTO が記録漏れ」を warning で検知する。
    try {
      const mode = (state.operation_mode || {}).current;
      if (mode === "conducted") {
        state.agent_teams = state.agent_teams || {};
        if (!Array.isArray(state.agent_teams.teammates)) {
          state.agent_teams.teammates = [];
        }
        state.agent_teams.last_snapshot_at = new Date().toISOString();

        if (state.agent_teams.teammates.length === 0) {
          state.warnings = state.warnings || [];
          state.warnings.push({
            at: new Date().toISOString(),
            kind: "conducted_teammates_missing",
            message: "conducted モードでセッション終了しますが agent_teams.teammates が空です。リード CTO が graceful shutdown 前に teammates の状態を state.json へ書き込んでください (conducted-mode.md §6 参照)。",
          });
          console.log("[SessionEnd][WARN] conducted_teammates_missing: agent_teams.teammates is empty");
        } else {
          const counts = state.agent_teams.teammates.reduce((acc, t) => {
            const s = (t && t.status) || "unknown";
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, {});
          const summary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ");
          console.log(`[SessionEnd] conducted mode snapshot: ${state.agent_teams.teammates.length} teammates (${summary})`);

          // 未完了 teammate が残ったまま終了する場合は warning。
          const unfinished = state.agent_teams.teammates.filter(t => {
            const s = (t && t.status) || "";
            return s === "working" || s === "needs_input";
          });
          if (unfinished.length > 0) {
            state.warnings = state.warnings || [];
            state.warnings.push({
              at: new Date().toISOString(),
              kind: "conducted_teammates_unfinished",
              message: `${unfinished.length} 個の teammate が working / needs_input のままセッション終了します。次セッションで spawn 計画から復元してください (teammates 自体は resume 不可)。`,
              roles: unfinished.map(t => t.role).filter(Boolean),
            });
            console.log(`[SessionEnd][WARN] conducted_teammates_unfinished: ${unfinished.length} teammate(s) still working/needs_input`);
          }
        }
      }
    } catch (ctErr) {
      if (process.env.CLAUDEOS_DEBUG) console.error(`[SessionEnd] conducted-snapshot skipped: ${ctErr.message}`);
    }

    writeJsonAtomic(STATE_FILE, state);
    console.log("[SessionEnd] state.json updated (last_stop_at recorded)");

    // Webhook: session_end イベントを外部へ通知（detached spawn）
    try {
      const { spawn } = require("child_process");
      const notifier = path.join(__dirname, "webhook-notifier.js");
      if (fs.existsSync(notifier)) {
        const payload = JSON.stringify({
          last_session_summary: (state.execution || {}).last_session_summary || null,
          phase: (state.execution || {}).phase || null,
        });
        const child = spawn(process.execPath, [notifier, "session_end", payload], {
          detached: true,
          stdio: "ignore",
          cwd: process.cwd(),
        });
        child.unref();
      }
    } catch { /* fail-soft */ }
  } else {
    console.log("[SessionEnd] state.json not found — skip");
  }
} catch (err) {
  console.error(`[SessionEnd] state update failed: ${err.message}`);
}

// ReasoningBank: セッション終了時にパターンを保存する（fail-soft）。
// state.json の atomic write が完了した直後に実行し、最新の stable / debug を参照する。
try {
  const rb       = require("./reasoning-bank.js");
  const stateRB  = readJson(STATE_FILE);
  if (stateRB) {
    const projectName = path.basename(process.cwd());
    const dataDir     = path.join(__dirname, "..", "..", "data");
    const bank        = rb.loadBank(dataDir);
    const entry       = rb.buildEntry(stateRB, projectName);
    if (entry) {
      // Stage 2: 既存エントリに SONA 重み更新（時間減衰 + アウトカムデルタ）を適用してから新規追加
      rb.updateSONAWeights(bank, entry.project, entry.tags, entry.stable_achieved);
      rb.upsertEntry(bank, entry);
      rb.pruneBank(bank);
      rb.saveBank(dataDir, bank);
      const sonaUpdated = bank.entries.filter(e => e.id !== entry.id).length;
      console.log(`[ReasoningBank] Saved: ${entry.id} conf=${entry.confidence.toFixed(2)} tags=[${entry.tags.join(",")}] | SONA updated ${sonaUpdated} existing entries`);
    } else {
      // 低信頼でも既存エントリの時間減衰だけは実行する
      const stateRBStab = (stateRB.stable || {});
      const stateRBExec = (stateRB.execution || {});
      const fallbackTags = rb.extractTags(stateRBExec.last_session_summary || "");
      rb.updateSONAWeights(bank, path.basename(process.cwd()), fallbackTags, !!stateRBStab.stable_achieved);
      rb.pruneBank(bank);
      rb.saveBank(dataDir, bank);
      console.log("[ReasoningBank] Entry skipped (confidence < 0.30 or no summary) | SONA decay applied");
    }
  }
} catch (rbErr) {
  console.error(`[ReasoningBank] ${rbErr.message}`);
}

// notify-stable を同期実行する（state.json への書き込みが完了してから）。
// 失敗しても Stop hook をブロックしない。
try {
  const notify = require("./notify-stable.js");
  if (notify && typeof notify.run === "function") {
    notify.run();
  }
} catch (err) {
  console.error(`[SessionEnd] notify-stable failed: ${err.message}`);
}

// Dreaming runner を spawn する。notify-stable の state.json 書き込み完了後に
// 起動することで、dreaming runner が stale な state を上書きするリスクを排除する。
if (dreamingEnabled) {
  try {
    const { spawn } = require("child_process");
    const runner = path.join(__dirname, "dreaming-runner.js");
    if (fs.existsSync(runner)) {
      const child = spawn(process.execPath, [runner], {
        detached: true,
        stdio: "ignore",
        cwd: process.cwd(),
      });
      child.unref(); // 親プロセスの終了をブロックしない
      console.log("[SessionEnd] Dreaming runner spawned (background)");
    }
  } catch (spawnErr) {
    console.error(`[SessionEnd] Dreaming spawn failed: ${spawnErr.message}`);
  }
}

process.exit(0);
