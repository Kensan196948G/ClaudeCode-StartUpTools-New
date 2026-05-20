#!/usr/bin/env node
// Phase 7C: claude ultrareview CLI ラッパー
//
// 機能:
// - `claude ultrareview --json [target]` を子プロセスで実行
// - 結果を reports/ultrareview/YYYY-MM-DD.json に保存
// - blocker/critical を検出した場合 state.warnings[] に kind=ultrareview_blocker を追記
// - state.feature_flags.ultrareview.monthly_count を更新 (月次上限制御)
//
// 使い方:
//   node scripts/tools/run-ultrareview.js                  # 現在ブランチをレビュー
//   node scripts/tools/run-ultrareview.js --target 290     # PR #290 をレビュー
//   node scripts/tools/run-ultrareview.js --target main    # base branch main 差分
//   node scripts/tools/run-ultrareview.js --dry-run        # 実行せず予定動作のみ表示
//   node scripts/tools/run-ultrareview.js --timeout 10     # timeout (分) 指定 (default 30)
//
// 注意: ultrareview はクラウド処理で課金対象。
// 月次上限を state.feature_flags.ultrareview.monthly_cap で制御する (default 50)。

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const STATE_FILE = path.join(process.cwd(), "state.json");
const REPORT_DIR = path.join(process.cwd(), "reports", "ultrareview");
const DEFAULT_MONTHLY_CAP = 50;

function parseArgs(argv) {
  const args = { target: null, dryRun: false, timeoutMinutes: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--target") args.target = argv[++i];
    else if (a === "--timeout") args.timeoutMinutes = parseInt(argv[++i], 10) || 30;
    else if (a === "-h" || a === "--help") {
      console.log("Usage: node scripts/tools/run-ultrareview.js [--target <pr#|branch>] [--dry-run] [--timeout <min>]");
      process.exit(0);
    }
  }
  return args;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStateAtomic(state) {
  const tmp = `${STATE_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function checkMonthlyCap(state) {
  state.feature_flags = state.feature_flags || {};
  state.feature_flags.ultrareview = state.feature_flags.ultrareview || {
    monthly_cap: DEFAULT_MONTHLY_CAP,
    current_month: currentMonth(),
    count: 0,
  };
  const ur = state.feature_flags.ultrareview;
  if (ur.current_month !== currentMonth()) {
    ur.current_month = currentMonth();
    ur.count = 0;
  }
  const cap = ur.monthly_cap || DEFAULT_MONTHLY_CAP;
  return { allowed: ur.count < cap, used: ur.count, cap, ur };
}

function appendWarning(state, payload) {
  state.warnings = state.warnings || [];
  state.warnings.push({
    at: new Date().toISOString(),
    kind: "ultrareview_blocker",
    ...payload,
  });
}

function todayStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = readState();
  const cap = checkMonthlyCap(state);

  console.log(`[ultrareview] monthly usage: ${cap.used}/${cap.cap}`);

  if (!cap.allowed) {
    console.log(`[ultrareview] SKIP: monthly cap reached (${cap.used}/${cap.cap}) for ${cap.ur.current_month}`);
    process.exit(0);
  }

  const cmd = "claude";
  const cmdArgs = ["ultrareview", "--json", "--timeout", String(args.timeoutMinutes)];
  if (args.target) cmdArgs.push(args.target);

  if (args.dryRun) {
    console.log(`[ultrareview][DRY-RUN] would run: ${cmd} ${cmdArgs.join(" ")}`);
    console.log(`[ultrareview][DRY-RUN] would save to: ${path.join(REPORT_DIR, `${todayStamp()}.json`)}`);
    console.log(`[ultrareview][DRY-RUN] monthly count would become: ${cap.used + 1}/${cap.cap}`);
    process.exit(0);
  }

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  console.log(`[ultrareview] running: ${cmd} ${cmdArgs.join(" ")}`);
  const startMs = Date.now();
  const r = spawnSync(cmd, cmdArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: (args.timeoutMinutes + 2) * 60 * 1000,
    shell: process.platform === "win32",
  });
  const elapsedSec = Math.round((Date.now() - startMs) / 1000);

  if (r.error) {
    console.error(`[ultrareview] spawn error: ${r.error.message}`);
    process.exit(2);
  }

  if (r.status !== 0) {
    console.error(`[ultrareview] non-zero exit ${r.status} after ${elapsedSec}s`);
    if (r.stderr) console.error(r.stderr);
    process.exit(r.status || 3);
  }

  let bugs = null;
  try {
    bugs = JSON.parse(r.stdout);
  } catch (e) {
    console.error(`[ultrareview] failed to parse JSON output: ${e.message}`);
    const rawPath = path.join(REPORT_DIR, `${todayStamp()}.raw.txt`);
    fs.writeFileSync(rawPath, r.stdout, "utf8");
    console.error(`[ultrareview] raw output saved to ${rawPath}`);
    process.exit(4);
  }

  const reportPath = path.join(REPORT_DIR, `${todayStamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(bugs, null, 2) + "\n", "utf8");
  console.log(`[ultrareview] saved to ${reportPath} (${elapsedSec}s)`);

  cap.ur.count += 1;

  const findings = Array.isArray(bugs) ? bugs : Array.isArray(bugs && bugs.bugs) ? bugs.bugs : [];
  const severeFindings = findings.filter((f) => {
    const sev = String((f && (f.severity || f.priority)) || "").toLowerCase();
    return sev === "critical" || sev === "high" || sev === "blocker";
  });

  if (severeFindings.length > 0) {
    appendWarning(state, {
      message: `ultrareview detected ${severeFindings.length} critical/high finding(s)`,
      severeCount: severeFindings.length,
      totalCount: findings.length,
      reportPath: path.relative(process.cwd(), reportPath),
    });
    console.log(`[ultrareview][WARN] ${severeFindings.length} critical/high finding(s); recorded to state.warnings`);
  } else {
    console.log(`[ultrareview] no critical/high findings (${findings.length} total finding(s))`);
  }

  writeStateAtomic(state);
  process.exit(severeFindings.length > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { parseArgs, checkMonthlyCap, currentMonth };
