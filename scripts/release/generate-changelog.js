#!/usr/bin/env node
/**
 * scripts/release/generate-changelog.js (ClaudeOS v8.2.4+)
 *
 * Conventional Commits 形式の git log から CHANGELOG.md / RELEASE_NOTES.md を生成する。
 *
 * 使い方:
 *   node scripts/release/generate-changelog.js                    # 前回タグ → HEAD
 *   node scripts/release/generate-changelog.js --from v3.2.89     # 起点指定
 *   node scripts/release/generate-changelog.js --to HEAD~5
 *   node scripts/release/generate-changelog.js --version v3.2.90  # 新セクション見出し
 *   node scripts/release/generate-changelog.js --release-notes    # RELEASE_NOTES.md として独立出力
 *   node scripts/release/generate-changelog.js --dry              # stdout のみ
 *
 * 解析対象:
 *   feat / fix / docs / refactor / perf / test / chore / build / ci / style / revert
 *   ! suffix → BREAKING 扱い
 *   (scope) は見出しの後ろに併記
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const opts = { dry: false, releaseNotes: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry") opts.dry = true;
  else if (a === "--release-notes") opts.releaseNotes = true;
  else if (a === "--from") opts.from = args[++i];
  else if (a === "--to")   opts.to   = args[++i];
  else if (a === "--version") opts.version = args[++i];
}

const cwd = process.cwd();

function git(cmd) {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function lastTag() {
  try { return git("git describe --tags --abbrev=0"); } catch { return ""; }
}

const TYPE_ORDER = ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "style", "chore", "revert"];
const TYPE_LABEL = {
  feat: "🚀 機能追加",
  fix: "🐛 バグ修正",
  perf: "⚡ パフォーマンス",
  refactor: "♻️ リファクタリング",
  docs: "📝 ドキュメント",
  test: "🧪 テスト",
  build: "📦 ビルド",
  ci: "🤖 CI",
  style: "💅 スタイル",
  chore: "🔧 雑務",
  revert: "⏪ revert",
};

function parseCommit(line) {
  // 形式: <sha>\t<subject>
  const idx = line.indexOf("\t");
  const sha = line.slice(0, idx);
  const subject = line.slice(idx + 1);
  // type(scope)!: message
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (m) {
    return { sha, type: m[1].toLowerCase(), scope: m[2] || "", breaking: !!m[3], message: m[4] };
  }
  return { sha, type: "other", scope: "", breaking: false, message: subject };
}

function collect(from, to) {
  const range = from ? `${from}..${to || "HEAD"}` : (to || "HEAD");
  const out = git(`git log ${range} --pretty=format:%h%x09%s`);
  if (!out) return [];
  return out.split("\n").map(parseCommit);
}

function group(commits) {
  const buckets = {};
  const breaking = [];
  for (const c of commits) {
    if (c.breaking) breaking.push(c);
    (buckets[c.type] = buckets[c.type] || []).push(c);
  }
  return { buckets, breaking };
}

function renderMarkdown(version, range, { buckets, breaking }) {
  const lines = [];
  const date = new Date().toISOString().slice(0, 10);
  lines.push(`## ${version} - ${date}`);
  lines.push("");
  lines.push(`_Range: \`${range}\`_`);
  lines.push("");

  if (breaking.length) {
    lines.push("### ⚠️ BREAKING CHANGES");
    lines.push("");
    for (const c of breaking) {
      lines.push(`- ${c.scope ? `**${c.scope}**: ` : ""}${c.message} (\`${c.sha}\`)`);
    }
    lines.push("");
  }

  for (const type of TYPE_ORDER) {
    const list = buckets[type];
    if (!list || list.length === 0) continue;
    lines.push(`### ${TYPE_LABEL[type]}`);
    lines.push("");
    for (const c of list) {
      lines.push(`- ${c.scope ? `**${c.scope}**: ` : ""}${c.message} (\`${c.sha}\`)`);
    }
    lines.push("");
  }
  const other = buckets.other || [];
  if (other.length) {
    lines.push("### その他");
    lines.push("");
    for (const c of other) lines.push(`- ${c.message} (\`${c.sha}\`)`);
    lines.push("");
  }
  return lines.join("\n");
}

function inferNextVersion(prev) {
  // 末尾の patch を +1。失敗時は "next" を返す。
  const m = (prev || "").match(/^(v?\d+\.\d+\.)(\d+)$/);
  if (!m) return "next";
  return `${m[1]}${Number(m[2]) + 1}`;
}

function main() {
  const from = opts.from || lastTag();
  const to   = opts.to   || "HEAD";
  const commits = collect(from, to);
  if (commits.length === 0) {
    console.error("[changelog] no commits in range");
    process.exit(0);
  }
  const version = opts.version || inferNextVersion(from);
  const range = `${from || "(start)"}..${to}`;
  const grouped = group(commits);
  const section = renderMarkdown(version, range, grouped);

  if (opts.dry) { console.log(section); return; }

  if (opts.releaseNotes) {
    const out = path.join(cwd, "RELEASE_NOTES.md");
    fs.writeFileSync(out, section + "\n", "utf8");
    console.log(`[changelog] wrote ${path.relative(cwd, out)}`);
    return;
  }

  const cl = path.join(cwd, "CHANGELOG.md");
  let existing = "";
  if (fs.existsSync(cl)) existing = fs.readFileSync(cl, "utf8");
  const header = "# Changelog\n\n";
  const body = existing.startsWith(header) ? existing.slice(header.length) : existing;
  fs.writeFileSync(cl, header + section + "\n\n" + body, "utf8");
  console.log(`[changelog] prepended ${path.relative(cwd, cl)} (${commits.length} commits)`);
}

if (require.main === module) main();

module.exports = { parseCommit, group, renderMarkdown, collect };
