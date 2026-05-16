#!/usr/bin/env node
// Trust Score シミュレーター
// 使い方: node scripts/tools/simulate-trust-score.js [ci_runs] [stable_rate]
// 例:     node scripts/tools/simulate-trust-score.js 15 0.8

const args = process.argv.slice(2);
const TARGET_CI_RUNS   = parseInt(args[0]) || 20;
const STABLE_RATE      = parseFloat(args[1]) || 1.0;   // STABLE 達成率（0.0〜1.0）
const BLOCK_EVENTS     = parseInt(args[2]) || 0;

console.log("=== ClaudeOS Trust Score シミュレーター ===");
console.log(`条件: CI ${TARGET_CI_RUNS}回 / STABLE率 ${Math.round(STABLE_RATE*100)}% / Blocked ${BLOCK_EVENTS}件\n`);

let total_ci = 0, success_ci = 0, streak = 0;
let total_sess = 0, stable_ach = 0;
let blocked = BLOCK_EVENTS;

const L2_THRESHOLD = 0.75;
const L3_THRESHOLD = 0.87;
let level2_reached_at = null;
let level3_reached_at = null;

for (let i = 1; i <= TARGET_CI_RUNS; i++) {
  // CI 実行（全成功と仮定）
  total_ci++;
  success_ci++;
  streak++;

  // セッション終了（1 CI = 1 session と仮定）
  total_sess++;
  const stable = Math.random() < STABLE_RATE;
  if (stable) stable_ach++;

  // 完全版 formula (trust-ledger.md 準拠)
  const base_score    = total_ci > 0 ? (success_ci / total_ci) * 0.5 : 0;
  const stable_bonus  = (stable_ach / Math.max(total_sess, 1)) * 0.3;
  const streak_bonus  = Math.min(streak / 10, 1.0) * 0.1;
  const block_penalty = Math.min(blocked * 0.05, 0.2);
  const score = Math.max(0, Math.min(1, base_score + stable_bonus + streak_bonus - block_penalty));
  const level = score >= L3_THRESHOLD ? 3 : score >= L2_THRESHOLD ? 2 : 1;

  if (level >= 2 && !level2_reached_at) level2_reached_at = i;
  if (level >= 3 && !level3_reached_at) level3_reached_at = i;

  // 5回ごとまたは Level 変化時に表示
  const prev_level = i > 1 ? (score - 0.01 >= L3_THRESHOLD ? 3 : score - 0.01 >= L2_THRESHOLD ? 2 : 1) : 1;
  if (i % 5 === 0 || level !== prev_level || i === 1 || i === TARGET_CI_RUNS) {
    const bar = "█".repeat(Math.round(score * 20)) + "░".repeat(20 - Math.round(score * 20));
    const lvlIcon = level === 3 ? "🟢" : level === 2 ? "🟡" : "🔴";
    console.log(
      `Session ${String(i).padStart(3)} | [${bar}] ${(score*100).toFixed(1).padStart(5)}% ` +
      `${lvlIcon} L${level} | stable=${stable_ach}/${total_sess} streak=${streak}`
    );
  }
}

console.log("\n=== 結果サマリー ===");
const final_base    = (success_ci / total_ci) * 0.5;
const final_stable  = (stable_ach / total_sess) * 0.3;
const final_streak  = Math.min(streak / 10, 1.0) * 0.1;
const final_penalty = Math.min(blocked * 0.05, 0.2);
const final_score   = Math.max(0, Math.min(1, final_base + final_stable + final_streak - final_penalty));
const final_level   = final_score >= L3_THRESHOLD ? 3 : final_score >= L2_THRESHOLD ? 2 : 1;

console.log(`最終スコア: ${(final_score*100).toFixed(2)}%`);
console.log(`  内訳: base=${(final_base*100).toFixed(1)}% stable_bonus=${(final_stable*100).toFixed(1)}% streak=${(final_streak*100).toFixed(1)}% penalty=-${(final_penalty*100).toFixed(1)}%`);
console.log(`最終 Level: ${final_level} ${"🔴🟡🟢".charAt((final_level-1)*2)}${"🔴🟡🟢".charAt((final_level-1)*2+1)}`);
console.log(`Level 2 到達: ${level2_reached_at ? `${level2_reached_at}セッション目` : "未到達"}`);
console.log(`Level 3 到達: ${level3_reached_at ? `${level3_reached_at}セッション目` : "未到達"}`);
console.log(`\nauto_merge: ${final_score >= L2_THRESHOLD ? "✅ 有効化可能" : "⏸ 未到達"}`);
