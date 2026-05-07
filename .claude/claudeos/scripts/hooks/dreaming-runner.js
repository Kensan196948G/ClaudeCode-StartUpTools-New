#!/usr/bin/env node
// Dreaming Runner (ClaudeOS v8.3 — Managed Agents Research Preview)
// @anthropic-ai/sdk (TypeScript SDK) を使用した Dreams API 実装。
//
// 実行条件:
//   state.dreaming.dreaming_enabled = true
//   ANTHROPIC_API_KEY 環境変数が設定済み
//   npm install 実行済み（このディレクトリで）
//
// アクセス申請: https://claude.com/form/claude-managed-agents
// 有効化: state.dreaming.dreaming_enabled を true に変更するだけ

"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, "state.json");

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
  // session-end.js と同じ atomic write パターン（temp + rename）
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// state.json の learning データから Memory Store 用コンテンツを生成する。
function buildSessionContent(state) {
  const agents = ((state.learning || {}).usage_history || {}).agents || {};
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

  // @anthropic-ai/sdk を動的ロード
  let Anthropic;
  try {
    // SDK は hooks/ ディレクトリ内の node_modules を優先して探す
    const sdkPath = path.join(__dirname, "node_modules", "@anthropic-ai", "sdk");
    Anthropic = fs.existsSync(sdkPath)
      ? require(sdkPath)
      : require("@anthropic-ai/sdk");
  } catch {
    console.log("[Dreaming] @anthropic-ai/sdk not found");
    console.log("[Dreaming] Run: cd .claude/claudeos/scripts/hooks && npm install");
    return;
  }

  console.log("[Dreaming] Starting... (Managed Agents Research Preview)");

  // SDK クライアント: defaultHeaders で全リクエストに beta header を付与
  const client = new Anthropic({
    apiKey,
    defaultHeaders: { "anthropic-beta": BETA_HEADER },
  });

  try {
    const content = buildSessionContent(state);

    // Step 1: Memory Store 作成
    const store = await client.beta.memoryStores.create({
      name: `claudeos-${new Date().toISOString().slice(0, 10)}`,
      description: "ClaudeOS v8 session learning data for Dreaming",
    });
    console.log(`[Dreaming] Memory Store created: ${store.id}`);

    // Step 2: セッションデータをファイルとして書き込み
    await client.beta.memoryStores.files.create(store.id, {
      name: "session-learning.md",
      content,
    });
    console.log("[Dreaming] Session data written to memory store");

    // Step 3: Dream 作成
    const dream = await client.beta.dreams.create({
      inputs: [{ type: "memory_store", memory_store_id: store.id }],
      model: "claude-opus-4-7",
      instructions: INSTRUCTIONS,
    });
    console.log(`[Dreaming] Dream created: ${dream.id} (status: ${dream.status})`);

    // dream_id を state.json に記録（プロセスが中断されても再確認できる）
    {
      const s = readJson(STATE_FILE);
      if (s) {
        s.dreaming = s.dreaming || {};
        s.dreaming.current_dream_id = dream.id;
        s.dreaming.current_dream_store_id = store.id;
        s.dreaming.last_dreaming_run = new Date().toISOString();
        writeJsonAtomic(STATE_FILE, s);
      }
    }

    // Step 4: ポーリング（最大 MAX_POLLS × POLL_INTERVAL_MS）
    let current = dream;
    let polls = 0;
    while ((current.status === "pending" || current.status === "running") && polls < MAX_POLLS) {
      await sleep(POLL_INTERVAL_MS);
      current = await client.beta.dreams.retrieve(dream.id);
      polls++;
      if (polls % 6 === 0) {
        console.log(`[Dreaming] Polling... status=${current.status} (${Math.round(polls * POLL_INTERVAL_MS / 1000)}s elapsed)`);
      }
    }

    if (current.status !== "completed") {
      console.log(`[Dreaming] Dream ended: ${current.status} — Dream ID saved for follow-up: ${dream.id}`);
      return;
    }

    // Step 5: 出力 Memory Store からファイルを読み取り、結果をパース
    const outputStore = (current.outputs || []).find((o) => o.type === "memory_store");
    if (!outputStore) {
      console.log("[Dreaming] No output memory store found in completed dream");
      return;
    }

    let extracted = { patterns: [], curated_memories: [], recurring_mistakes: [] };
    const { data: files } = await client.beta.memoryStores.files.list(outputStore.memory_store_id);
    for (const f of files || []) {
      const file = await client.beta.memoryStores.files.retrieve(outputStore.memory_store_id, f.id);
      const parsed = parseExtracted(file.content || "");
      if (parsed.patterns.length > 0) {
        extracted = parsed;
        break;
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
      await client.beta.memoryStores.archive(store.id);
      console.log(`[Dreaming] Input store archived: ${store.id}`);
    } catch { /* fail-soft */ }

    // Step 8: dream_complete イベントを Webhook 通知
    try {
      const { spawn } = require("child_process");
      const notifier = path.join(__dirname, "webhook-notifier.js");
      if (fs.existsSync(notifier)) {
        const payload = JSON.stringify({
          patterns_count:  extracted.patterns.length,
          memories_count:  extracted.curated_memories.length,
          mistakes_count:  extracted.recurring_mistakes.length,
          dream_id:        dream.id,
        });
        const child = spawn(process.execPath, [notifier, "dream_complete", payload], {
          detached: true,
          stdio:    "ignore",
          cwd:      PROJECT_ROOT,
        });
        child.unref();
      }
    } catch { /* fail-soft */ }

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
