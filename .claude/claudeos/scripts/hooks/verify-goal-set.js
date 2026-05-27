#!/usr/bin/env node
// SessionStart hook (ClaudeOS v9.0)
// START_PROMPT.md ステップ A の /goal 本文を抽出し、Claude に逐語実行を促す。
//
// 設計方針:
//  - Claude Code 公式 /goal は runtime 内で管理され state.json に書き込まれないため
//    「事後検証」ではなく「事前注入」方式を採用する。
//  - START_PROMPT.md から /goal "..." 行を機械的に抽出して提示することで、
//    Claude が逐語コピーすべき文字列を session 開始時に必ず目にする状態を作る。
//  - 必須キーワードの整合性も同時にチェックし、テンプレ側の劣化を検出する。

const fs = require("fs");
const path = require("path");

const START_PROMPT_CANDIDATES = [
  "Claude/templates/claude/START_PROMPT.md",
  ".claude/START_PROMPT.md",
  "START_PROMPT.md",
];

const REQUIRED_KEYWORDS = [
  "CTO全権委任",
  "Monitor",
  "Verify",
  "AgentTeams",
  "5時間",
  "README",
  "GitHub Projects",
  "stop after",
];

function findStartPrompt() {
  for (const rel of START_PROMPT_CANDIDATES) {
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function extractGoalLine(content) {
  // フェンス付きコードブロック内の /goal "..." を抽出する
  // プロローグに含まれる /goal "..." プレースホルダ（説明文中の参照）は除外
  const fenceRe = /```[a-zA-Z]*\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(content)) !== null) {
    const block = m[1];
    const idx = block.indexOf('/goal "');
    if (idx < 0) continue;
    let i = idx + '/goal "'.length;
    let escaped = false;
    while (i < block.length) {
      const c = block[i];
      if (escaped) { escaped = false; i++; continue; }
      if (c === '\\') { escaped = true; i++; continue; }
      if (c === '"') {
        // プレースホルダ "..." は短すぎるのでスキップ
        const candidate = block.slice(idx, i + 1);
        if (candidate.length > 20) return candidate;
        break;
      }
      i++;
    }
  }
  return null;
}

const startPrompt = findStartPrompt();
if (!startPrompt) {
  console.log("[verify-goal-set] START_PROMPT.md not found — skip");
  process.exit(0);
}

let content;
try {
  content = fs.readFileSync(startPrompt, "utf8");
} catch (e) {
  console.log(`[verify-goal-set] read failed: ${e.message}`);
  process.exit(0);
}

const goalLine = extractGoalLine(content);
if (!goalLine) {
  console.log("[verify-goal-set] ⚠️ START_PROMPT.md に /goal \"...\" ブロックが見つかりません");
  console.log(`  確認対象: ${startPrompt}`);
  process.exit(0);
}

const missing = REQUIRED_KEYWORDS.filter((kw) => !goalLine.includes(kw));

console.log("[verify-goal-set] 🔒 START_PROMPT.md ステップ A — /goal 逐語実行リマインダ");
console.log("");
console.log("  以下の文字列を **一字一句変えず** Skill ツール経由で即時実行すること:");
console.log("");
console.log("  ───────── BEGIN VERBATIM /goal ─────────");
// 改行を保ち、各行に2スペースインデントを付けて見やすく表示
goalLine.split(/\r?\n/).forEach((line) => console.log(`  ${line}`));
console.log("  ─────────  END VERBATIM /goal  ─────────");
console.log("");

if (missing.length > 0) {
  console.log(`  ⚠️ テンプレ整合性警告: 必須キーワード欠落 = ${missing.join(", ")}`);
  console.log("     → START_PROMPT.md の /goal 文面を見直してください");
} else {
  console.log("  ✅ 必須キーワード 8/8 整合");
}

console.log("");
console.log("  禁止: 要約・短縮・整形・前置き宣言。");
console.log("  実行後、ステップ B (ClaudeOS ファイル Read) へ進むこと。");

process.exit(0);
