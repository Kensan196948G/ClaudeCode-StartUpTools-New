#!/usr/bin/env node
// agent-teams-status.js — Agent Teams 使用状況 CLI ビューア
//
// state.agent_teams_usage (agent-teams-tracker.js hook 由来) を読み、
// CLI で表形式に表示する。WebUI を使わない運用向け。
//
// 使い方:
//   node scripts/tools/agent-teams-status.js              # 現在の状況を表示
//   node scripts/tools/agent-teams-status.js --history    # 履歴も全件表示
//   node scripts/tools/agent-teams-status.js --json       # JSON 出力
//   node scripts/tools/agent-teams-status.js --watch      # 30秒ごと再表示
//   node scripts/tools/agent-teams-status.js --help       # ヘルプ

const fs   = require("fs");
const path = require("path");

const STATE_FILE = path.join(process.cwd(), "state.json");

// ──────────────────────────────────────────────────────────────────────
// 引数パース
// ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAG = {
  json:    argv.includes("--json"),
  history: argv.includes("--history"),
  watch:   argv.includes("--watch"),
  help:    argv.includes("--help") || argv.includes("-h"),
  plain:   process.env.CLAUDEOS_PLAIN_OUTPUT === "1" || argv.includes("--plain"),
};

if (FLAG.help) {
  console.log(`
agent-teams-status.js — Agent Teams 使用状況 CLI ビューア

使い方:
  node scripts/tools/agent-teams-status.js [options]

オプション:
  --json       JSON 形式で出力（パイプ・スクリプト連携向け）
  --history    過去セッション履歴を全件表示
  --watch      30秒ごとに再表示（Ctrl+C で終了）
  --plain      アイコン無しのプレーンテキスト出力
  --help, -h   このヘルプを表示

データソース:
  state.json の agent_teams_usage フィールド
  (agent-teams-tracker.js hook が PostToolUse で記録)
`);
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────────────
// アイコン定数（plain モード時はテキスト置換）
// ──────────────────────────────────────────────────────────────────────
const ICON = FLAG.plain ? {
  header:  "##", team: "[T]",   msg: "[M]",   pattern: "[P]",
  ok:      "[OK]", warn: "[!]", chart: "[#]", time: "[t]",
  dim:     "-",  arrow: "->", bullet: "*",
} : {
  header:  "🤝", team: "👥",    msg: "📨",    pattern: "🎯",
  ok:      "✅", warn: "⚠️",   chart: "📊",  time: "⏱",
  dim:     "·",  arrow: "→",   bullet: "•",
};

// ──────────────────────────────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────────────────────────────
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    return null;
  }
}

function relTime(isoStr) {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  if (isNaN(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

function pad(s, n) {
  const str = String(s);
  // 全角文字を 2 文字幅としてカウント
  let w = 0;
  for (const c of str) w += (c.charCodeAt(0) > 0xff ? 2 : 1);
  return str + " ".repeat(Math.max(0, n - w));
}

function hr(n = 70) { return "─".repeat(n); }

// パターン名 → 説明
const PATTERN_DESC = {
  A: "並列実装 (Backend + Frontend + テスト)",
  B: "品質強化 (バグ修復 + Security + 回帰)",
  C: "調査・設計 (技術調査 + 設計 + Devil's Advocate)",
};

// ──────────────────────────────────────────────────────────────────────
// 表示ロジック
// ──────────────────────────────────────────────────────────────────────
function render() {
  const state = readState();
  if (!state) {
    console.error(`${ICON.warn} state.json が読み込めません: ${STATE_FILE}`);
    process.exit(1);
  }

  const atu = state.agent_teams_usage;

  if (FLAG.json) {
    console.log(JSON.stringify(atu || { available: false }, null, 2));
    return;
  }

  console.clear && FLAG.watch && console.clear();

  // ヘッダ
  console.log("");
  console.log(`${ICON.header} Agent Teams Status — ${path.basename(process.cwd())}`);
  console.log(hr());

  if (!atu) {
    console.log(`${ICON.warn} まだ計測データがありません。`);
    console.log(`   ${ICON.bullet} Claude が TeamCreate / SendMessage を実行すると記録が始まります`);
    console.log(`   ${ICON.bullet} hook 登録確認: .claude/settings.json (PostToolUse > matcher: TeamCreate / SendMessage)`);
    console.log("");
    return;
  }

  // 現セッション
  const cur = atu.current_session || {};
  console.log(`${ICON.chart} 現セッション`);
  console.log(`   ${ICON.bullet} セッション開始    : ${atu.session_start_at || "—"} (${relTime(atu.session_start_at)})`);
  console.log(`   ${ICON.team} TeamCreate       : ${pad(cur.team_create_count || 0, 4)} 回`);
  console.log(`   ${ICON.msg} SendMessage      : ${pad(cur.send_message_count || 0, 4)} 回`);
  const patterns = cur.patterns_used || [];
  console.log(`   ${ICON.pattern} 使用パターン     : ${patterns.length ? patterns.join(", ") : "—"}`);
  patterns.forEach(p => {
    if (PATTERN_DESC[p]) console.log(`        ${ICON.arrow} ${p}: ${PATTERN_DESC[p]}`);
  });
  console.log(`   ${ICON.time} 最終アクティビティ: ${cur.last_activity_at || "—"}${cur.last_activity_at ? ` (${relTime(cur.last_activity_at)})` : ""}`);
  console.log("");

  // 現セッションの teammates
  const teammates = cur.teammates || [];
  if (teammates.length > 0) {
    console.log(`${ICON.team} 現セッションで spawn された Teammates (直近 ${Math.min(teammates.length, 10)} 件)`);
    console.log(`   ${pad("Team", 20)} ${pad("Name", 20)} ${pad("SubagentType", 26)} ${pad("Spawned", 12)}`);
    console.log(`   ${"─".repeat(20)} ${"─".repeat(20)} ${"─".repeat(26)} ${"─".repeat(12)}`);
    teammates.slice(-10).forEach(t => {
      console.log(`   ${pad(t.team || "—", 20)} ${pad(t.name || "—", 20)} ${pad(t.subagent_type || "—", 26)} ${pad(relTime(t.spawned_at), 12)}`);
    });
    console.log("");
  }

  // 履歴サマリ
  const hist = Array.isArray(atu.history) ? atu.history : [];
  if (hist.length > 0) {
    const sevenAgo = Date.now() - 7 * 86400000;
    const recent   = hist.filter(h => {
      try { return new Date(h.session_start_at).getTime() >= sevenAgo; } catch { return false; }
    });
    const patternCount = { A: 0, B: 0, C: 0 };
    let totalTC = 0, totalSM = 0;
    recent.forEach(h => {
      (h.patterns_used || []).forEach(p => { if (patternCount[p] !== undefined) patternCount[p] += 1; });
      totalTC += h.team_create_count  || 0;
      totalSM += h.send_message_count || 0;
    });

    console.log(`${ICON.chart} 直近 7 日サマリ (${recent.length} sessions / 履歴総数 ${hist.length})`);
    console.log(`   ${ICON.team} TeamCreate 合計  : ${totalTC} 回`);
    console.log(`   ${ICON.msg} SendMessage 合計 : ${totalSM} 回`);
    console.log(`   ${ICON.pattern} パターン別       : A=${patternCount.A}  B=${patternCount.B}  C=${patternCount.C}`);
    console.log("");
  }

  // --history フラグ時のみ全件表示
  if (FLAG.history && hist.length > 0) {
    console.log(`${ICON.chart} 履歴全件 (${hist.length} 件)`);
    console.log(`   ${pad("Date", 12)} ${pad("Patterns", 12)} ${pad("TC", 5)} ${pad("SM", 5)} ${pad("Teammates", 10)} Session Start`);
    console.log(`   ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(5)} ${"─".repeat(5)} ${"─".repeat(10)} ${"─".repeat(24)}`);
    hist.slice().reverse().forEach(h => {
      console.log(
        `   ${pad(h.date || "—", 12)} ${pad((h.patterns_used || []).join(",") || "—", 12)} ` +
        `${pad(h.team_create_count || 0, 5)} ${pad(h.send_message_count || 0, 5)} ` +
        `${pad(h.teammates_count || 0, 10)} ${h.session_start_at || "—"}`
      );
    });
    console.log("");
  } else if (hist.length === 0) {
    console.log(`${ICON.dim} 履歴データなし (新規導入時は最初のセッション終了後から蓄積されます)`);
    console.log("");
  }

  // フッタ
  console.log(hr());
  console.log(`${ICON.ok} データソース: ${STATE_FILE} (agent_teams_usage)`);
  console.log(`   詳細: node scripts/tools/agent-teams-status.js --help`);
  if (FLAG.watch) console.log(`   ${ICON.time} watch モード (Ctrl+C で終了)  最終更新: ${new Date().toLocaleTimeString("ja-JP")}`);
  console.log("");
}

// ──────────────────────────────────────────────────────────────────────
// 実行
// ──────────────────────────────────────────────────────────────────────
render();
if (FLAG.watch && !FLAG.json) {
  setInterval(render, 30000);
}
