#!/usr/bin/env node
/**
 * sync-github-projects.js — ClaudeOS GitHub Projects 自動同期
 *
 * 動作モード（自動選択）:
 *   Mode A: GitHub Projects V2 GraphQL (project スコープあり)
 *   Mode B: ラベルベース状態同期 (repo スコープのみ — フォールバック)
 *
 * 使い方:
 *   node scripts/tools/sync-github-projects.js [--dry-run]
 *
 * 認証スコープ追加（Mode A を使う場合）:
 *   gh auth refresh -s read:project
 */

"use strict";

const { execSync, spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const STATE_FILE = path.join(process.cwd(), "state.json");

// ラベル → GitHub Projects Status マッピング
const LABEL_TO_STATUS = {
  "status:open":        "Backlog",
  "status:in-progress": "In Progress",
  "status:done":        "Done",
};

function gh(args, input) {
  const res = spawnSync("gh", args.split(" "), {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { ok: res.status === 0, stdout: (res.stdout || "").trim(), stderr: (res.stderr || "").trim() };
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Mode B: ラベルベース同期（repo スコープのみで動作）
// state.json の completed_issues / blocked_issues から Issue ラベルを自動更新
// ──────────────────────────────────────────────────────────────────────────────
function syncLabels(state) {
  const results = { synced: 0, skipped: 0, errors: 0 };

  const completed = (state.completed_issues || []).map(i =>
    typeof i === "object" ? i.issue || i.id : i
  ).filter(Boolean);

  const blocked = (state.blocked_issues || []).map(i =>
    typeof i === "object" ? i.issue || i.id : i
  ).filter(Boolean);

  // 完了 Issue → status:done + remove status:open / status:in-progress
  for (const issueRef of completed) {
    const num = String(issueRef).replace(/[^0-9]/g, "");
    if (!num) continue;
    if (DRY_RUN) {
      console.log(`  [dry-run] #${num} → label: status:done`);
      results.synced++;
      continue;
    }
    const r = gh(`issue edit ${num} --add-label status:done --remove-label status:open --remove-label status:in-progress`);
    if (r.ok) { console.log(`  ✅ #${num} → status:done`); results.synced++; }
    else       { console.log(`  ❌ #${num} failed: ${r.stderr.slice(0,80)}`); results.errors++; }
  }

  // Blocked Issue → status:in-progress + blocked ラベル
  for (const issueRef of blocked) {
    const num = String(issueRef).replace(/[^0-9]/g, "");
    if (!num) continue;
    if (DRY_RUN) {
      console.log(`  [dry-run] #${num} → label: blocked + status:in-progress`);
      results.synced++;
      continue;
    }
    const r = gh(`issue edit ${num} --add-label blocked --add-label status:in-progress --remove-label status:open`);
    if (r.ok) { console.log(`  🔴 #${num} → blocked + status:in-progress`); results.synced++; }
    else       { console.log(`  ❌ #${num} failed: ${r.stderr.slice(0,80)}`); results.errors++; }
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mode A: GitHub Projects V2 GraphQL 同期（project スコープが必要）
// ──────────────────────────────────────────────────────────────────────────────
function detectProjectScope() {
  // 実際に GraphQL を試して scope を確認（auth status の解析より確実）
  const testQuery = '{ viewer { login } }';
  const r = spawnSync("gh", ["api", "graphql", "-f", `query=${testQuery}`], {
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  if (!r.ok && r.stderr.includes("INSUFFICIENT_SCOPES")) return false;
  // projectsV2 フィールドにアクセスできるかテスト
  const projQuery = '{ viewer { projectsV2(first:1) { totalCount } } }';
  const r2 = spawnSync("gh", ["api", "graphql", "-f", `query=${projQuery}`], {
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  return r2.status === 0 && !r2.stderr.includes("INSUFFICIENT_SCOPES");
}

function getProjectId(owner, projectNum) {
  const query = `{
    user(login: "${owner}") {
      projectV2(number: ${projectNum}) { id title }
    }
  }`;
  const r = gh(`api graphql -f query=${JSON.stringify(query)}`);
  if (!r.ok) return null;
  try {
    const d = JSON.parse(r.stdout);
    return d.data?.user?.projectV2?.id || null;
  } catch { return null; }
}

function syncProjectsV2(state, owner, projectNum) {
  const projectId = getProjectId(owner, projectNum);
  if (!projectId) {
    console.log(`  ⚠️ Project #${projectNum} が見つかりません（owner: ${owner}）`);
    return null;
  }
  console.log(`  Projects V2 ID: ${projectId}`);
  // Items の取得と Status 更新は省略（scope確認後に拡張）
  return { projectId };
}

// ──────────────────────────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────────────────────────
function main() {
  console.log("=== GitHub Projects 同期 ===");
  DRY_RUN && console.log("⚠️  DRY-RUN モード");

  const state = readState();
  if (!state) {
    console.log("state.json が見つかりません — スキップ");
    process.exit(0);
  }

  const completed = (state.completed_issues || []).length;
  const blocked   = (state.blocked_issues   || []).length;
  console.log(`completed_issues: ${completed} 件 / blocked_issues: ${blocked} 件`);

  if (completed === 0 && blocked === 0) {
    console.log("同期対象の Issue がありません");
    process.exit(0);
  }

  // スコープ検出と動作モード選択
  const hasProjectScope = detectProjectScope();
  console.log(`認証スコープ: ${hasProjectScope ? "✅ project スコープあり (Mode A)" : "⚠️ project スコープなし → Mode B (ラベルベース)"}`);

  if (!hasProjectScope) {
    console.log("\n[Mode B] ラベルベース同期を実行...");
    const r = syncLabels(state);
    console.log(`\n結果: synced=${r.synced} skipped=${r.skipped} errors=${r.errors}`);
    console.log("\n💡 GitHub Projects V2 に直接同期する場合:");
    console.log("   ! gh auth refresh -s read:project");
    console.log("   その後、再実行してください");
  } else {
    console.log("\n[Mode A] GitHub Projects V2 同期...");
    // オーナーとプロジェクト番号は state.json か config.json から取得
    const owner = process.env.GITHUB_REPOSITORY_OWNER || "Kensan196948G";
    const projectNum = parseInt(process.env.CLAUDEOS_PROJECT_NUM || "1", 10);
    syncProjectsV2(state, owner, projectNum);
    // Mode A でも Mode B のラベル同期は実行（Projects + ラベル両方更新）
    syncLabels(state);
  }
}

main();
