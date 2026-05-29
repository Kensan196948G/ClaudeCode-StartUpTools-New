#!/usr/bin/env node
// SessionStart hook (ClaudeOS v9.0)
// START_PROMPT.md の冒頭 /goal 本文を抽出し、テンプレ整合性チェックと
// 手動 claude 起動時のコピー元として提示する。
//
// 重要な背景:
// - 通常運用 (start.bat → Start-ClaudeCode.ps1 経由): START_PROMPT.md 全文が
//   `& claude @args` で claude に渡され、冒頭 /goal は Claude Code UI が
//   自動実行する。ユーザーは何もしなくてよい。
// - 手動運用 (`claude` を直接起動): START_PROMPT.md は使われないため、
//   このリマインダがユーザーへのコピー元として機能する。
//
// 設計方針:
//  - START_PROMPT.md から /goal "..." 行を機械的に抽出して画面に提示
//  - 必須キーワード整合性をチェックし、テンプレ側の劣化を検出
//  - hook 出力は Claude にも見えるため、Claude は /goal の現在内容を把握できる
//  - /goal の実行自体は Skill ツール経由不可 (UI コマンド仕様)

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
  "DynamicWorkflows",
  "CodeRabbit",
  "security",
];

function findStartPrompt() {
  for (const rel of START_PROMPT_CANDIDATES) {
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function extractGoalLine(content) {
  // 優先 1: ファイル冒頭が /goal "..." で始まる場合（自動実行用の正規形式）
  // 優先 2: フェンス付きコードブロック内の /goal "..."（後方互換）
  // 短すぎる "..." プレースホルダは除外。
  function tryExtractFrom(text, startIdx) {
    let i = startIdx + '/goal "'.length;
    let escaped = false;
    while (i < text.length) {
      const c = text[i];
      if (escaped) { escaped = false; i++; continue; }
      if (c === '\\') { escaped = true; i++; continue; }
      if (c === '"') {
        const candidate = text.slice(startIdx, i + 1);
        return candidate.length > 20 ? candidate : null;
      }
      i++;
    }
    return null;
  }

  // 優先 1: 冒頭の /goal "..." (Start-ClaudeCode.ps1 経由で自動実行される位置)
  if (content.startsWith('/goal "')) {
    const result = tryExtractFrom(content, 0);
    if (result) return result;
  }

  // 優先 2: フェンス付きコードブロック内 (旧形式の後方互換)
  const fenceRe = /```[a-zA-Z]*\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(content)) !== null) {
    const block = m[1];
    const idx = block.indexOf('/goal "');
    if (idx < 0) continue;
    const result = tryExtractFrom(block, idx);
    if (result) return result;
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

console.log("[verify-goal-set] 🔒 START_PROMPT.md 整合性チェック + /goal 本文プレビュー");
console.log("");
console.log("  start.bat 経由起動時: 冒頭 /goal は Claude Code 本体が自動実行します。");
console.log("  手動 claude 起動時:   以下を対話プロンプトにコピー＆Enter してください:");
console.log("");
console.log("  ───────── /goal (canonical) ─────────");
goalLine.split(/\r?\n/).forEach((line) => console.log(`  ${line}`));
console.log("  ─────────  END  /goal  ─────────");
console.log("");

if (missing.length > 0) {
  console.log(`  ⚠️ テンプレ整合性警告: 必須キーワード欠落 = ${missing.join(", ")}`);
  console.log("     → START_PROMPT.md の /goal 文面を見直してください");
} else {
  console.log(`  ✅ 必須キーワード ${REQUIRED_KEYWORDS.length}/${REQUIRED_KEYWORDS.length} 整合`);
}

console.log("");
console.log("  Note: /goal は Claude Code UI コマンドのため Skill ツールから実行不可。");
console.log("        Claude は本リマインダを参考に /goal の現在内容を把握できる。");

process.exit(0);
