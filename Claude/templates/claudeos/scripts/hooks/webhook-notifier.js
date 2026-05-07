#!/usr/bin/env node
// webhook-notifier.js (ClaudeOS v8.3)
// アウトバウンド Webhook 通知 — Teams / 汎用 HTTPS / Slack（将来）
//
// 呼び出し方:
//   require('./webhook-notifier').notify(event, data)  // モジュール
//   node webhook-notifier.js <event> '<json>'           // CLI テスト
//
// 環境変数（URL はgitに入れず env で管理）:
//   TEAMS_WEBHOOK_URL      — Teams Incoming Webhook URL
//   HTTPS_WEBHOOK_URL      — 汎用 HTTPS エンドポイント URL
//   HTTPS_WEBHOOK_SECRET   — HMAC-256 署名シークレット（任意）
//   SLACK_WEBHOOK_URL      — Slack Incoming Webhook URL（将来）
//
// state.json に以下を追加して通知を有効化:
//   "webhook": {
//     "enabled": true,
//     "events": { "stable_achieved": true, "session_end": true,
//                 "ci_blocked": true, "dream_complete": true }
//   }

"use strict";

const https  = require("https");
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

const PROJECT_ROOT = process.cwd();
const STATE_FILE   = path.join(PROJECT_ROOT, "state.json");
const TIMEOUT_MS   = 8000; // 1エンドポイントあたりの上限

// ---------- ユーティリティ ----------

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

// HTTPS POST（タイムアウト付き）
function httpsPost(url, payload, extraHeaders) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const parsed  = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port:     parseInt(parsed.port || "443", 10),
      path:     parsed.pathname + (parsed.search || ""),
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent":     "ClaudeOS-Webhook/1.0",
        ...extraHeaders,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end",  () => resolve({ status: res.statusCode, body: data }));
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`timeout after ${TIMEOUT_MS}ms`));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// HMAC-256 署名（汎用 HTTPS オプション）
function sign(secret, body) {
  return "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(typeof body === "string" ? body : JSON.stringify(body))
    .digest("hex");
}

// ---------- イベント設定 ----------

const EVENT_CONFIG = {
  stable_achieved: { color: "00B050", icon: "✅", label: "STABLE 達成" },
  session_end:     { color: "0078D4", icon: "🏁", label: "セッション終了" },
  ci_blocked:      { color: "D83B01", icon: "🚨", label: "CI Blocked" },
  dream_complete:  { color: "7719AA", icon: "💡", label: "Dreaming 完了" },
};

// ---------- フォーマッター ----------

// Teams Incoming Webhook — MessageCard 形式
// Adaptive Cards への移行は将来対応（現時点で全 Incoming Webhook と互換）
function buildTeamsCard(event, data) {
  const cfg   = EVENT_CONFIG[event] || { color: "0078D4", icon: "📢", label: event };
  const facts = Object.entries(data)
    .filter(([k, v]) => v != null && String(v).length <= 200 && !k.startsWith("_"))
    .map(([k, v]) => ({ name: k, value: String(v) }));

  return {
    "@type":    "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: cfg.color,
    summary:    `ClaudeOS: ${cfg.label}`,
    sections: [
      {
        activityTitle:    `${cfg.icon} ClaudeOS — ${cfg.label}`,
        activitySubtitle: `プロジェクト: ${data.project || "ClaudeOS v8"}`,
        facts,
      },
    ],
  };
}

// 汎用 HTTPS — 標準 JSON + 任意 HMAC 署名
function buildGenericPayload(event, data) {
  return {
    event,
    timestamp: new Date().toISOString(),
    source:    "claudeos-v8",
    data,
  };
}

// Slack — Incoming Webhook（将来用）
function buildSlackPayload(event, data) {
  const cfg = EVENT_CONFIG[event] || { icon: "📢", label: event };
  return {
    text: `${cfg.icon} *ClaudeOS — ${cfg.label}*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `${cfg.icon} *ClaudeOS — ${cfg.label}*`,
            `プロジェクト: ${data.project || "ClaudeOS v8"}`,
            Object.entries(data)
              .filter(([k, v]) => v != null && !k.startsWith("_") && k !== "project")
              .map(([k, v]) => `• ${k}: ${v}`)
              .join("\n"),
          ].filter(Boolean).join("\n"),
        },
      },
    ],
  };
}

// ---------- 送信ロジック ----------

async function sendTeams(url, event, data) {
  const payload = buildTeamsCard(event, data);
  const res     = await httpsPost(url, payload, {});
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${String(res.body).slice(0, 120)}`);
  }
  console.log(`[Webhook] Teams OK (HTTP ${res.status})`);
}

async function sendGenericHttps(url, secret, event, data) {
  const payload = buildGenericPayload(event, data);
  const body    = JSON.stringify(payload);
  const headers = {};
  if (secret) {
    headers["X-ClaudeOS-Signature"] = sign(secret, body);
  }
  const res = await httpsPost(url, payload, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${String(res.body).slice(0, 120)}`);
  }
  console.log(`[Webhook] HTTPS OK (HTTP ${res.status})`);
}

async function sendSlack(url, event, data) {
  const payload = buildSlackPayload(event, data);
  const res     = await httpsPost(url, payload, {});
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${String(res.body).slice(0, 120)}`);
  }
  console.log(`[Webhook] Slack OK (HTTP ${res.status})`);
}

// ---------- メイン API ----------

/**
 * イベントを全設定済みエンドポイントに送信する。
 * @param {string} event  'stable_achieved' | 'session_end' | 'ci_blocked' | 'dream_complete'
 * @param {object} data   イベント固有の追加データ
 */
async function notify(event, data = {}) {
  const state      = readJson(STATE_FILE) || {};
  const webhookCfg = state.webhook || {};

  if (!webhookCfg.enabled) return;

  const events = webhookCfg.events || {};
  if (!events[event]) return;

  // state.json から共通フィールドを付与
  const enriched = {
    project:             (state.goal || {}).title || "ClaudeOS v8",
    phase:               (state.execution || {}).phase || null,
    stable_achieved:     (state.stable || {}).stable_achieved ?? null,
    consecutive_success: (state.stable || {}).consecutive_success ?? null,
    ...data,
  };

  const teamsUrl    = process.env.TEAMS_WEBHOOK_URL   || "";
  const httpsUrl    = process.env.HTTPS_WEBHOOK_URL   || "";
  const httpsSecret = process.env.HTTPS_WEBHOOK_SECRET || "";
  const slackUrl    = process.env.SLACK_WEBHOOK_URL   || "";

  const errors = [];

  if (teamsUrl) {
    try   { await sendTeams(teamsUrl, event, enriched); }
    catch (e) { errors.push(`Teams: ${e.message}`); }
  }

  if (httpsUrl) {
    try   { await sendGenericHttps(httpsUrl, httpsSecret, event, enriched); }
    catch (e) { errors.push(`HTTPS: ${e.message}`); }
  }

  // Slack: 将来対応 — SLACK_WEBHOOK_URL を設定するだけで有効化
  if (slackUrl) {
    try   { await sendSlack(slackUrl, event, enriched); }
    catch (e) { errors.push(`Slack: ${e.message}`); }
  }

  if (errors.length > 0) {
    console.error(`[Webhook] 送信エラー: ${errors.join(" / ")}`);
  }
}

module.exports = { notify };

// ---------- CLI テスト実行 ----------
// node webhook-notifier.js stable_achieved '{"version":"v3.2.111","pr":265}'

if (require.main === module) {
  const event = process.argv[2] || "stable_achieved";
  let   data  = {};
  try { data = JSON.parse(process.argv[3] || "{}"); } catch { /* ignore */ }

  console.log(`[Webhook] Test: event=${event}`);
  notify(event, data)
    .then(() => { console.log("[Webhook] Test complete"); process.exit(0); })
    .catch((e) => { console.error("[Webhook] Test failed:", e.message); process.exit(1); });
}
