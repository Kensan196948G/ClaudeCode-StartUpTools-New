#!/usr/bin/env node
// ReasoningBank — コアモジュール (ClaudeOS v8.2 / Stage-1)
//
// 役割:
//   セッション終了時に「何をしたか・なぜ成功/失敗したか」を構造化して保存し、
//   将来のセッション開始時に類似問題へのヒントとして注入する。
//
// 公開 API:
//   loadBank(dataDir)              → bank オブジェクトを返す
//   saveBank(dataDir, bank)        → atomic 書き込み
//   buildEntry(state, projectName) → エントリを構築（信頼スコア閾値未満は null）
//   upsertEntry(bank, entry)       → 追加または重複更新
//   pruneBank(bank)                → 低品質エントリを整理
//   extractTags(text)              → タグ配列を返す
//   detectProblemPattern(text)     → 問題パターン文字列を返す
//   calcConfidence(...)            → 信頼スコアを返す

"use strict";

const fs   = require("fs");
const path = require("path");

// ------------------------------------------------------------------ 定数
const BANK_FILE         = "reasoning-bank.json";
const MIN_CONFIDENCE    = 0.15;   // これ以下は prune で自動削除
const SAVE_THRESHOLD    = 0.30;   // buildEntry がエントリを返す最低ライン
const MAX_ENTRIES       = 200;    // バンク上限（超えたら低信頼を削除）
const SIMILARITY_THRESH = 0.60;   // Jaccard 類似度がこれ以上なら重複と判定

// ------------------------------------------------------------------ I/O

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function loadBank(dataDir) {
  const file = path.join(dataDir, BANK_FILE);
  const existing = readJson(file);
  if (existing && Array.isArray(existing.entries)) return existing;
  return { version: "1.0", description: "ClaudeOS ReasoningBank", entries: [] };
}

function saveBank(dataDir, bank) {
  fs.mkdirSync(dataDir, { recursive: true });
  writeJsonAtomic(path.join(dataDir, BANK_FILE), bank);
}

// ------------------------------------------------------------------ タグ抽出

// [正規表現, タグ名] のペア。テキストに含まれるキーワードからタグを生成する。
const TAG_PATTERNS = [
  [/\b(typescript|\.tsx?\b)/i,               "typescript"],
  [/\b(javascript|\.jsx?\b)/i,               "javascript"],
  [/\b(python|\.py\b)/i,                     "python"],
  [/\b(rust|\.rs\b)/i,                       "rust"],
  [/\b(go|golang)\b/i,                       "golang"],
  [/\b(lint|eslint|prettier|biome)\b/i,      "lint"],
  [/\b(test|jest|vitest|pytest|spec)\b/i,    "test"],
  [/\b(build|webpack|vite|tsc|rollup)\b/i,   "build"],
  [/\b(ci|github.actions|workflow|pipeline)\b/i, "ci"],
  [/\b(security|cve|脆弱性|vuln)\b/i,        "security"],
  [/\b(merge|pr|pull.request|プルリク)\b/i,  "pr"],
  [/\b(refactor|リファクタリング)\b/i,        "refactor"],
  [/\b(readme|docs|ドキュメント|document)\b/i, "docs"],
  [/\b(docker|container|コンテナ)\b/i,       "docker"],
  [/\b(database|db|sql|postgres|mysql)\b/i,  "database"],
  [/\b(auth|authentication|認証|authorization)\b/i, "auth"],
  [/\b(fix|修正|バグ|bug|error|エラー)\b/i,  "bugfix"],
  [/\b(stable|stab|STABLE)\b/,              "stable"],
  [/\b(cron|schedule|スケジュール)\b/i,      "cron"],
  [/\b(hook|フック)\b/i,                    "hook"],
  [/\b(powershell|\.ps1\b)/i,              "powershell"],
  [/\b(shell|bash|\.sh\b)/i,              "shell"],
  [/\b(version|バージョン|drift|dri)/i,    "version"],
  [/\b(deploy|デプロイ|release|リリース)\b/i, "deploy"],
  [/\b(memory|メモリ|context|コンテキスト)\b/i, "memory"],
];

function extractTags(text) {
  if (!text) return [];
  const tags = new Set();
  for (const [re, tag] of TAG_PATTERNS) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags];
}

// ------------------------------------------------------------------ 問題パターン検出

// よく使われる問題記述パターンを前から順に試みる。
const PROBLEM_MARKERS = [
  /([^。\n]{5,60})(エラー|失敗|error|fail|broken)/i,
  /(fix|修正|修復)[：: ]+([^。\n]{5,60})/i,
  /(issue|問題|不具合)[：: ]+([^。\n]{5,60})/i,
  /(対応|解消|解決)[：: ]+([^。\n]{5,60})/i,
];

// 途中で切れた括弧・記号を末尾から取り除いて返す
function trimIncomplete(s) {
  return s.replace(/[\s（(【「『〔\[{、，,]+$/, "").trim();
}

function detectProblemPattern(text) {
  if (!text) return "";
  for (const re of PROBLEM_MARKERS) {
    const m = text.match(re);
    if (m) return trimIncomplete(m[0].slice(0, 100));
  }
  // フォールバック: 先頭 100 文字を正規化して返す
  return trimIncomplete(text.slice(0, 100).replace(/\s+/g, " "));
}

// ------------------------------------------------------------------ 信頼スコア計算

function calcConfidence(stableAchieved, ciPassed, consecutiveSuccess) {
  let score = 0.20;                                           // ベーススコア
  if (stableAchieved)                   score += 0.40;       // STABLE 達成で大幅加算
  if (ciPassed)                         score += 0.25;       // CI 通過
  if ((consecutiveSuccess || 0) >= 3)   score += 0.10;       // 連続成功 3+ で加算
  if ((consecutiveSuccess || 0) >= 5)   score += 0.05;       // 連続成功 5+ でさらに加算
  return Math.min(1.0, Math.round(score * 100) / 100);
}

// ------------------------------------------------------------------ エントリ構築

function buildEntry(state, projectName) {
  if (!state) return null;

  const exec    = state.execution || {};
  const stab    = state.stable    || {};
  const dbg     = state.debug     || {};
  const summary = exec.last_session_summary || "";

  // CI 合否は debug.last_failure_category が "none" または空で判定
  const failCat  = (dbg.last_failure_category || "").toLowerCase();
  const ciPassed = (failCat === "none" || failCat === "");

  const confidence = calcConfidence(
    !!stab.stable_achieved,
    ciPassed,
    stab.consecutive_success
  );

  // 閾値未満は保存しない（部分失敗ノイズを排除）
  if (confidence < SAVE_THRESHOLD) return null;
  if (!summary) return null;

  const now = new Date().toISOString();
  const uid = `${now.slice(0, 19).replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    id:                  `rb-${uid}`,
    timestamp:           now,
    project:             projectName || "unknown",
    phase:               exec.phase || "unknown",
    problem_pattern:     detectProblemPattern(summary),
    approach:            summary.slice(0, 250),
    tags:                extractTags(summary),
    outcome:             stab.stable_achieved ? "success" : "partial",
    stable_achieved:     !!stab.stable_achieved,
    ci_passed:           ciPassed,
    consecutive_success: stab.consecutive_success || 0,
    confidence,
    used_count:          0,
    last_used:           now,
  };
}

// ------------------------------------------------------------------ 重複排除 (Jaccard 類似度)

function jaccardSimilarity(a, b) {
  const wa = new Set((a || "").toLowerCase().split(/[\s。、,./\-_]+/).filter(Boolean));
  const wb = new Set((b || "").toLowerCase().split(/[\s。、,./\-_]+/).filter(Boolean));
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

function isSimilar(existing, incoming) {
  if (existing.project !== incoming.project) return false;
  if (existing.phase   !== incoming.phase)   return false;
  // 同一日以外は別エントリ扱い（違う日の同パターンも記録する）
  if ((existing.timestamp || "").slice(0, 10) !== (incoming.timestamp || "").slice(0, 10)) return false;
  return jaccardSimilarity(existing.problem_pattern, incoming.problem_pattern) >= SIMILARITY_THRESH;
}

function upsertEntry(bank, entry) {
  const dup = bank.entries.find(e => isSimilar(e, entry));
  if (dup) {
    // 既存エントリの信頼スコアをより高い方に更新
    dup.confidence  = Math.min(1.0, Math.max(dup.confidence, entry.confidence));
    dup.last_used   = entry.timestamp;
    dup.used_count  = (dup.used_count || 0) + 1;
    dup.approach    = entry.approach;   // 最新のアプローチで上書き
    return bank;
  }
  bank.entries.push(entry);
  return bank;
}

// ------------------------------------------------------------------ バンク整理

function pruneBank(bank) {
  bank.entries = bank.entries
    .filter(e => (e.confidence || 0) >= MIN_CONFIDENCE)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, MAX_ENTRIES);
  return bank;
}

// ------------------------------------------------------------------ Stage 2: SONA 重み更新（時間減衰 + アウトカムデルタ）

// セッション終了時に呼び出す。
// - 同プロジェクトの既存エントリに時間減衰を適用する（1日あたり 2% 減衰）。
// - 今セッションのタグと重なるエントリには成功/失敗デルタも加算する。
// - 当日作成の新規エントリはスキップ（buildEntry で設定済みのため二重更新を防ぐ）。
function updateSONAWeights(bank, currentProject, currentTags, outcomeSuccess) {
  const now   = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  bank.entries = bank.entries.map(entry => {
    // 今日作成したエントリはスキップ
    if ((entry.timestamp || "").slice(0, 10) === today) return entry;
    // 別プロジェクトは減衰のみ（デルタなし）
    const sameProject = entry.project === currentProject;

    // 時間減衰: last_used からの経過日数で指数減衰
    const refDate = entry.last_used || entry.timestamp;
    const ageDays = Math.max(0, (now - Date.parse(refDate)) / 86400000);
    const decayed = entry.confidence * Math.pow(0.98, ageDays);

    if (!sameProject) {
      // 別プロジェクトは減衰のみ
      const updated = Math.max(MIN_CONFIDENCE, Math.round(decayed * 100) / 100);
      return { ...entry, confidence: updated };
    }

    // タグ重複数でデルタの適用可否を決定
    const tagOverlap = (entry.tags || []).filter(t => (currentTags || []).includes(t)).length;
    if (tagOverlap === 0) {
      const updated = Math.max(MIN_CONFIDENCE, Math.round(decayed * 100) / 100);
      return { ...entry, confidence: updated };
    }

    // タグ関連エントリ: 成功 +0.10、失敗 -0.10
    const delta   = outcomeSuccess ? +0.10 : -0.10;
    const updated = Math.min(1.0, Math.max(MIN_CONFIDENCE,
      Math.round((decayed + delta) * 100) / 100
    ));
    return { ...entry, confidence: updated };
  });

  return bank;
}

// ------------------------------------------------------------------ Stage 3: 関連パターン検索（session-start 注入用）

const RETRIEVE_CONF_THRESHOLD = 0.40;  // これ以下のエントリは注入しない

// 現在のセッションコンテキストに最も関連するパターンを上位 topN 件返す。
// スコア = entry.confidence + 同プロジェクト(+0.30) + 同フェーズ(+0.20) + タグ重複数×0.10
function retrieveRelevantPatterns(bank, projectName, phase, currentTags, topN) {
  topN = topN || 3;
  return bank.entries
    .filter(e => (e.confidence || 0) >= RETRIEVE_CONF_THRESHOLD)
    .map(e => {
      let score = e.confidence;
      if (e.project === projectName)  score += 0.30;
      if (e.phase   === phase)        score += 0.20;
      const tagOverlap = (e.tags || []).filter(t => (currentTags || []).includes(t)).length;
      score += tagOverlap * 0.10;
      return { entry: e, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(x => x.entry);
}

// ------------------------------------------------------------------ 公開 API

module.exports = {
  loadBank,
  saveBank,
  buildEntry,
  upsertEntry,
  pruneBank,
  updateSONAWeights,
  retrieveRelevantPatterns,
  extractTags,
  detectProblemPattern,
  calcConfidence,
};
