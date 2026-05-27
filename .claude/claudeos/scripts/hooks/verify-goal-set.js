#!/usr/bin/env node
// SessionStart hook (ClaudeOS v9.0)
// START_PROMPT.md ステップ A の /goal 本文を抽出し、ユーザーが手動入力する形で提示する。
//
// 重要: /goal は Claude Code の UI コマンドであり、Claude (Skill ツール) からは実行不可。
//       ユーザーが対話プロンプトに直接 /goal "..." と打ち込む必要がある。
//
// 設計方針:
//  - START_PROMPT.md から /goal "..." 行を機械的に抽出して画面に提示することで、
//    ユーザーが正本テキストをワンクリックでコピーできる状態を作る。
//  - 必須キーワードの整合性も同時にチェックし、テンプレ側の劣化を検出する。
//  - hook は Claude にも見える形で stdout に出力するため、Claude は「ユーザーに
//    /goal 提示が必要な場合」を判断する材料として活用できる。

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

console.log("[verify-goal-set] 🔒 START_PROMPT.md ステップ A — /goal コピー＆実行リマインダ");
console.log("");
console.log("  ⚠️ /goal は UI コマンドのため Claude (Skill ツール) からは実行不可。");
console.log("     ユーザーが対話プロンプトに以下を **一字一句変えず** 入力してください:");
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
console.log("  禁止: 要約・短縮・整形 (コピペ前提)。");
console.log("  Claude は「以下の /goal をご自身で実行してください」とユーザーに案内し、");
console.log("  ユーザー入力を待たずに次のステップ (ClaudeOS ファイル Read) へ進むこと。");

process.exit(0);
