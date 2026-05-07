#!/usr/bin/env node
// Dreaming Runner (ClaudeOS v8.3 — Managed Agents Research Preview)
// セッション終了後に非同期 spawn され、パターン抽出結果を state.dreaming へ書き込む。
//
// 実行条件:
//   state.dreaming.dreaming_enabled = true
//   ANTHROPIC_API_KEY 環境変数が設定済み
//
// アクセス申請: https://claude.com/form/claude-managed-agents
// 有効化方法:  state.json の dreaming.dreaming_enabled を true に変更するだけ
//
// 依存: Node.js 内蔵 https モジュールのみ（npm install 不要）

"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, "state.json");

const API_HOST = "api.anthropic.com";
const API_VERSION = "2023-06-01";
const BETA_HEADER = "managed-agents-2026-04-01,dreaming-2026-04-21";
const POLL_INTERVAL_MS = 10000; // 10 秒
const MAX_POLLS = 120;          // 最大 20 分

// ---------- ユーティリティ ----------

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  // session-end.js と同じ atomic write パターンで競合を回避する。
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function apiRequest(method, urlPath, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: API_HOST,
      port: 443,
      path: urlPath,
      method,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-beta": BETA_HEADER,
        "content-type": "application/json",
        ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- コンテンツ生成 ----------

// state.json の learning データから Memory Store に書き込む Markdown コンテンツを生成する。
function buildSessionContent(state) {
  const learning = state.learning || {};
  const agents = (learning.usage_history || {}).agents || {};
  const exec = state.execution || {};
  const stable = state.stable || {};
  const dreaming = state.dreaming || {};

  const lines = [
    "# ClaudeOS v8 セッション学習データ",
    `目標: ${(state.goal || {}).title || "不明"}`,
    `フェーズ: ${exec.phase || "不明"}`,
    `STABLE達成: ${stable.stable_achieved || false}`,
    `連続成功: ${stable.consecutive_success || 0} / 目標 ${stable.target_n || 3}`,
    `最終停止: ${exec.last_stop_at || "不明"}`,
    `セッション要約: ${exec.last_session_summary || "なし"}`,
    "",
    "## エージェント使用頻度（上位 15）",
  ];

  Object.entries(agents)
    .filter(([k]) => !k.startsWith("_"))
    .sort((a, b) => (b[1].call_count || 0) - (a[1].call_count || 0))
    .slice(0, 15)
    .forEach(([name, data]) => lines.push(`- ${name}: ${data.call_count || 0}回`));

  const prev = dreaming.recurring_mistakes || [];
  if (prev.length > 0) {
    lines.push("", "## 前回記録された繰り返しミス（継続確認用）");
    prev.forEach((m) => lines.push(`- ${m}`));
  }

  return lines.join("\n");
}

// Dreaming に渡す instructions（ClaudeOS 専用・最大 4,096 文字）
const INSTRUCTIONS = `
あなたは ClaudeOS v8 自律開発システムのセッション記録を分析しています。
以下の 3 点を日本語で抽出・整理してください。

1. patterns: 複数セッションで収束している効率的なワークフロー（3〜5 件）
2. curated_memories: 次セッション開始時に知っておくべき重要な知識・判断基準（3〜5 件）
3. recurring_mistakes: 繰り返し発生しているエラーや判断ミス（3〜5 件）

出力は以下の JSON 形式のみとし、説明文は含めないでください:
{"patterns":["..."],"curated_memories":["..."],"recurring_mistakes":["..."]}
`.trim();

// ---------- 結果パース ----------

function parseExtracted(raw) {
  const empty = { patterns: [], curated_memories: [], recurring_mistakes: [] };
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return empty;
    const parsed = JSON.parse(m[0]);
    return {
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      curated_memories: Array.isArray(parsed.curated_memories) ? parsed.curated_memories : [],
      recurring_mistakes: Array.isArray(parsed.recurring_mistakes) ? parsed.recurring_mistakes : [],
    };
  } catch {
    return empty;
  }
}

// ---------- メイン ----------

async function run() {
  const state = readJson(STATE_FILE);
  if (!state) {
    console.log("[Dreaming] state.json not found — skip");
    return;
  }

  const dreamingState = state.dreaming || {};

  if (!dreamingState.dreaming_enabled) {
    console.log("[Dreaming] dreaming_enabled = false — skip");
    console.log("[Dreaming] アクセス承認後に state.dreaming.dreaming_enabled を true に変更してください");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[Dreaming] ANTHROPIC_API_KEY not set — skip");
    return;
  }

  console.log("[Dreaming] Starting pattern extraction (Managed Agents Research Preview)...");

  try {
    // Step 1: Memory Store 作成
    const storeRes = await apiRequest("POST", "/v1/memory-stores", {
      name: `claudeos-${new Date().toISOString().slice(0, 10)}`,
      description: "ClaudeOS v8 session learning data for Dreaming",
    }, apiKey);

    if (storeRes.status !== 200 && storeRes.status !== 201) {
      console.error(`[Dreaming] Memory Store creation failed: HTTP ${storeRes.status}`);
      console.error("[Dreaming] Detail:", JSON.stringify(storeRes.body));
      return;
    }
    const storeId = storeRes.body.id;
    console.log(`[Dreaming] Memory Store created: ${storeId}`);

    // Step 2: セッションデータを Memory Store に書き込み
    const content = buildSessionContent(state);
    const fileRes = await apiRequest("POST", `/v1/memory-stores/${storeId}/files`, {
      name: "session-learning.md",
      content,
    }, apiKey);

    if (fileRes.status !== 200 && fileRes.status !== 201) {
      console.error(`[Dreaming] Memory Store file write failed: HTTP ${fileRes.status}`);
      return;
    }
    console.log("[Dreaming] Session data written to memory store");

    // Step 3: Dream 作成
    const dreamRes = await apiRequest("POST", "/v1/dreams", {
      inputs: [{ type: "memory_store", memory_store_id: storeId }],
      model: "claude-opus-4-7",
      instructions: INSTRUCTIONS,
    }, apiKey);

    if (dreamRes.status !== 200 && dreamRes.status !== 201) {
      console.error(`[Dreaming] Dream creation failed: HTTP ${dreamRes.status}`);
      console.error("[Dreaming] Detail:", JSON.stringify(dreamRes.body));
      return;
    }

    const dreamId = dreamRes.body.id;
    console.log(`[Dreaming] Dream created: ${dreamId} (status: ${dreamRes.body.status})`);

    // dream_id を state.json に記録（再開可能にするため）
    {
      const s = readJson(STATE_FILE);
      if (s) {
        s.dreaming = s.dreaming || {};
        s.dreaming.current_dream_id = dreamId;
        s.dreaming.current_dream_store_id = storeId;
        s.dreaming.last_dreaming_run = new Date().toISOString();
        writeJsonAtomic(STATE_FILE, s);
      }
    }

    // Step 4: ポーリング（最大 MAX_POLLS × POLL_INTERVAL_MS）
    let dream = dreamRes.body;
    let polls = 0;
    while ((dream.status === "pending" || dream.status === "running") && polls < MAX_POLLS) {
      await sleep(POLL_INTERVAL_MS);
      const pollRes = await apiRequest("GET", `/v1/dreams/${dreamId}`, null, apiKey);
      if (pollRes.status === 200) {
        dream = pollRes.body;
      }
      polls++;
      if (polls % 6 === 0) {
        console.log(`[Dreaming] Polling... status=${dream.status} (${Math.round(polls * POLL_INTERVAL_MS / 1000)}s elapsed)`);
      }
    }

    if (dream.status !== "completed") {
      console.log(`[Dreaming] Dream ended with status: ${dream.status}`);
      console.log(`[Dreaming] Dream ID を保存済み — 次回セッション開始時に再確認: ${dreamId}`);
      return;
    }

    // Step 5: 出力 Memory Store からファイルを読み取り、結果をパース
    const outputStore = (dream.outputs || []).find((o) => o.type === "memory_store");
    if (!outputStore) {
      console.log("[Dreaming] No output memory store found in completed dream");
      return;
    }

    let extracted = { patterns: [], curated_memories: [], recurring_mistakes: [] };
    const filesRes = await apiRequest("GET", `/v1/memory-stores/${outputStore.memory_store_id}/files`, null, apiKey);

    if (filesRes.status === 200) {
      for (const f of filesRes.body.data || []) {
        const fr = await apiRequest("GET", `/v1/memory-stores/${outputStore.memory_store_id}/files/${f.id}`, null, apiKey);
        if (fr.status === 200) {
          const parsed = parseExtracted(fr.body.content || "");
          if (parsed.patterns.length > 0) extracted = parsed;
        }
      }
    }

    // Step 6: 結果を state.dreaming へ書き込み
    {
      const s = readJson(STATE_FILE);
      if (s) {
        s.dreaming = s.dreaming || {};
        s.dreaming.patterns = extracted.patterns;
        s.dreaming.curated_memories = extracted.curated_memories;
        s.dreaming.recurring_mistakes = extracted.recurring_mistakes;
        s.dreaming.last_dreaming_run = new Date().toISOString();
        s.dreaming.current_dream_id = null;
        writeJsonAtomic(STATE_FILE, s);
      }
    }

    console.log(`[Dreaming] Completed — patterns: ${extracted.patterns.length}, memories: ${extracted.curated_memories.length}, mistakes: ${extracted.recurring_mistakes.length}`);

    // Step 7: 入力 Memory Store を後片付け（エラーは無視）
    try {
      await apiRequest("POST", `/v1/memory-stores/${storeId}/archive`, {}, apiKey);
      console.log(`[Dreaming] Input store archived: ${storeId}`);
    } catch {
      // fail-soft: アーカイブ失敗はスキップ
    }

  } catch (err) {
    console.error(`[Dreaming] Error: ${err.message}`);
    // エラーを state.dreaming.last_error に記録
    try {
      const s = readJson(STATE_FILE);
      if (s) {
        s.dreaming = s.dreaming || {};
        s.dreaming.last_error = err.message;
        s.dreaming.last_error_at = new Date().toISOString();
        writeJsonAtomic(STATE_FILE, s);
      }
    } catch { /* ignore */ }
    process.exit(0); // fail-soft: Stop hook をブロックしない
  }
}

run().catch((err) => {
  console.error(`[Dreaming] Uncaught: ${err.message}`);
  process.exit(0);
});
