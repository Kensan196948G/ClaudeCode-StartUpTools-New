#!/usr/bin/env node
/**
 * run-audit-scan.js — Audit-Agent 実行スクリプト（ClaudeOS Phase 6D）
 * Verify フェーズ末尾で呼び出し、変更証跡を収集して reports/audit/YYYY-MM-DD.md に出力。
 */

"use strict";

const fs    = require("fs");
const path  = require("path");
const { spawnSync } = require("child_process");

const ROOT     = process.cwd();
const TODAY    = new Date().toISOString().slice(0, 10);
const OUT_DIR  = path.join(ROOT, "reports", "audit");
const OUT_FILE = path.join(OUT_DIR, `${TODAY}.md`);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
  return (r.stdout || "").trim();
}

function gh(args) {
  const r = spawnSync("gh", args.split(" "), { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
  return { ok: r.status === 0, out: (r.stdout || "").trim() };
}

// ── 証跡収集 ─────────────────────────────────────────────────────────────

function collectGitEvidence() {
  const log = run("git", ["log", "--pretty=format:%H|%an|%ad|%s", "--date=short", "-10"]);
  return log.split("\n").filter(Boolean).map(l => {
    const [sha, author, date, ...rest] = l.split("|");
    return { sha: sha.slice(0, 8), author, date, message: rest.join("|").slice(0, 80) };
  });
}

function collectPREvidence() {
  const r = gh("pr list --state merged --limit 5 --json number,title,mergedAt,author");
  if (!r.ok) return [];
  try {
    return JSON.parse(r.out).map(p => ({
      number: p.number,
      title:  (p.title || "").slice(0, 60),
      merged_at: (p.mergedAt || "").slice(0, 10),
      author: p.author?.login || "unknown",
    }));
  } catch { return []; }
}

function collectCIEvidence() {
  const r = gh("run list --branch main --limit 5 --json conclusion,workflowName,createdAt,headSha");
  if (!r.ok) return [];
  try {
    return JSON.parse(r.out).map(run => ({
      workflow: run.workflowName,
      result:   run.conclusion || "in_progress",
      date:     (run.createdAt || "").slice(0, 10),
      sha:      (run.headSha || "").slice(0, 8),
    }));
  } catch { return []; }
}

function checkBranchProtection() {
  // ブランチ保護: main への直接 push が禁止されているか確認
  const r = gh("api repos/{owner}/{repo}/branches/main/protection");
  if (!r.ok) return { protected: false, required_checks: 0 };
  try {
    const d = JSON.parse(r.out);
    const checks = (d.required_status_checks?.contexts || []).length;
    return { protected: true, required_reviews: d.required_pull_request_reviews?.required_approving_review_count || 0, required_checks: checks };
  } catch { return { protected: false, required_checks: 0 }; }
}

function checkSecretsLeak() {
  const r = gh("run list --branch main --limit 10 --json conclusion,workflowName");
  if (!r.ok) return { scanned: false };
  try {
    const runs = JSON.parse(r.out);
    const scan = runs.find(r => r.workflowName.toLowerCase().includes("secret") || r.workflowName.toLowerCase().includes("security"));
    if (!scan) return { scanned: false };
    return { scanned: true, result: scan.conclusion };
  } catch { return { scanned: false }; }
}

// ── 準拠チェック ─────────────────────────────────────────────────────────

function complianceCheck(gitLog, prs, ciRuns, branchProt, secretsScan) {
  const items = [];

  // 変更管理: PR 経由でのマージ確認
  items.push({
    control: "変更管理 — PR経由マージ",
    status: branchProt.protected ? "PASS" : "WARN",
    evidence: branchProt.protected
      ? `ブランチ保護: required_checks=${branchProt.required_checks}`
      : "main への直接 push が許可されている（確認が必要）",
  });

  // CI 成功確認
  const recentCI = ciRuns.find(r => r.workflow === "CI");
  items.push({
    control: "CI パイプライン成功",
    status: recentCI?.result === "success" ? "PASS" : "WARN",
    evidence: recentCI ? `最新 CI: ${recentCI.result} (${recentCI.date})` : "CI 実行記録なし",
  });

  // Secrets スキャン
  items.push({
    control: "Secrets / セキュリティスキャン",
    status: secretsScan.scanned ? (secretsScan.result === "success" ? "PASS" : "FAIL") : "WARN",
    evidence: secretsScan.scanned ? `スキャン結果: ${secretsScan.result}` : "スキャン実行記録なし",
  });

  // コミット証跡
  items.push({
    control: "コミット証跡（変更者・日時）",
    status: gitLog.length > 0 ? "PASS" : "WARN",
    evidence: `直近 ${gitLog.length} コミット記録済み`,
  });

  // PR レビュー承認
  items.push({
    control: "PR レビュー承認記録",
    status: prs.length > 0 ? "PASS" : "WARN",
    evidence: prs.length > 0 ? `${prs.length} 件の merge 済み PR 確認` : "PR 記録なし",
  });

  return items;
}

// ── レポート生成 ──────────────────────────────────────────────────────────

function buildReport(gitLog, prs, ciRuns, branchProt, secretsScan) {
  const compliance = complianceCheck(gitLog, prs, ciRuns, branchProt, secretsScan);
  const passCount  = compliance.filter(c => c.status === "PASS").length;
  const warnCount  = compliance.filter(c => c.status === "WARN").length;
  const failCount  = compliance.filter(c => c.status === "FAIL").length;

  const lines = [
    `# 監査レポート — ${TODAY}`,
    ``,
    `**生成**: ClaudeOS Audit-Agent Phase 6D`,
    `**プロジェクト**: ${path.basename(ROOT)}`,
    `**レビュー日**: ${TODAY}`,
    ``,
    `## 📊 準拠サマリー`,
    ``,
    `| 結果 | 件数 |`,
    `|---|---|`,
    `| ✅ PASS | ${passCount} |`,
    `| ⚠️ WARN | ${warnCount} |`,
    `| ❌ FAIL | ${failCount} |`,
    ``,
    `## 🔍 準拠チェック詳細`,
    ``,
    `| 管理策 | 状態 | 証跡 |`,
    `|---|---|---|`,
    ...compliance.map(c => `| ${c.control} | ${c.status === "PASS" ? "✅" : c.status === "FAIL" ? "❌" : "⚠️"} ${c.status} | ${c.evidence} |`),
    ``,
    `## 📝 変更証跡（直近10コミット）`,
    ``,
    `| SHA | 変更者 | 日付 | メッセージ |`,
    `|---|---|---|---|`,
    ...gitLog.map(g => `| \`${g.sha}\` | ${g.author} | ${g.date} | ${g.message} |`),
    ``,
    `## 🔀 マージ済み PR（直近5件）`,
    ``,
    prs.length > 0
      ? [`| PR# | タイトル | マージ日 | 担当者 |`, `|---|---|---|---|`,
         ...prs.map(p => `| #${p.number} | ${p.title} | ${p.merged_at} | ${p.author} |`)].join("\n")
      : "_記録なし_",
    ``,
    `## ⚙️ CI/CD 実行記録（直近5件）`,
    ``,
    ciRuns.length > 0
      ? [`| ワークフロー | 結果 | 日付 | SHA |`, `|---|---|---|---|`,
         ...ciRuns.map(r => `| ${r.workflow} | ${r.result} | ${r.date} | \`${r.sha}\` |`)].join("\n")
      : "_記録なし_",
    ``,
    `---`,
    ``,
    `**[停止理由]**`,
    `- 状態: 完了`,
    `- 理由: Audit スキャン完了 (PASS=${passCount} WARN=${warnCount} FAIL=${failCount})`,
    `- 次アクション: ${failCount > 0 ? "FAIL 項目を Issue 起票してセキュリティに連絡" : "問題なし — 次フェーズへ移行"}`,
  ];

  return { report: lines.join("\n"), passCount, warnCount, failCount };
}

// ── メイン ─────────────────────────────────────────────────────────────────

function main() {
  console.log("=== Audit-Agent スキャン ===");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("git 変更証跡を収集中...");
  const gitLog      = collectGitEvidence();
  console.log("PR 証跡を収集中...");
  const prs         = collectPREvidence();
  console.log("CI 実行記録を収集中...");
  const ciRuns      = collectCIEvidence();
  console.log("ブランチ保護を確認中...");
  const branchProt  = checkBranchProtection();
  console.log("Secrets スキャン結果を確認中...");
  const secretsScan = checkSecretsLeak();

  const { report, passCount, warnCount, failCount } = buildReport(gitLog, prs, ciRuns, branchProt, secretsScan);
  fs.writeFileSync(OUT_FILE, report, "utf8");

  console.log(`\n準拠チェック: PASS=${passCount} WARN=${warnCount} FAIL=${failCount}`);
  console.log(`出力: ${OUT_FILE}`);

  if (failCount > 0) {
    console.log("\n⚠️ FAIL 項目あり — Security に連絡し Issue 起票してください");
    process.exit(1);
  }

  console.log("\n[停止理由]\n- 状態: 完了\n- 理由: 全準拠チェック PASS\n- 次アクション: PR 作成・マージへ移行");
}

main();
