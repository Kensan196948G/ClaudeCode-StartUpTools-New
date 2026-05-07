#!/usr/bin/env node
// Stop hook (ClaudeOS v8.2)
// セッション終了時に state.json を最終更新し、続けて notify-stable を同期実行する。
// 並列実行による state.json への race condition を避けるため、両者は単一 hook エントリに統合する。
// 失敗しても Stop hook をブロックしない fail-soft 設計。

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

    writeJsonAtomic(STATE_FILE, state);
    console.log("[SessionEnd] state.json updated (last_stop_at recorded)");

    // Dreaming runner を非同期 spawn（dreaming_enabled = true のときのみ）
    // dreaming_enabled は Anthropic Console でアクセス承認後に true に変更する。
    if (state.dreaming.dreaming_enabled) {
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

// 続けて notify-stable を同期実行する。失敗しても Stop hook をブロックしない。
try {
  const notify = require("./notify-stable.js");
  if (notify && typeof notify.run === "function") {
    notify.run();
  }
} catch (err) {
  console.error(`[SessionEnd] notify-stable failed: ${err.message}`);
}

process.exit(0);
