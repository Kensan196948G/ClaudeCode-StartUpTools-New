#!/usr/bin/env node
/**
 * scripts/setup/install-review-tools.js (ClaudeOS v8.2.5+)
 *
 * CodeRabbit + Codex のセットアップ状態を確認し、不足分の修正手順を提示する。
 * オプションで、プロジェクトに .coderabbit.yaml と .codex/config.toml.example を配置する。
 *
 * 使い方:
 *   node scripts/setup/install-review-tools.js                  # 診断のみ
 *   node scripts/setup/install-review-tools.js --apply          # config 配布
 *   node scripts/setup/install-review-tools.js --apply --force  # 既存上書き
 *   node scripts/setup/install-review-tools.js --project /path  # 別 project
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const args = process.argv.slice(2);
const opts = { apply: false, force: false, project: process.cwd() };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--apply") opts.apply = true;
  else if (a === "--force") opts.force = true;
  else if (a === "--project") opts.project = path.resolve(args[++i]);
}

const PROJECT = opts.project;
const TEMPLATE_DIR = path.resolve(__dirname, "..", "..", "Claude", "templates", "claudeos", "review-configs");

function which(cmd) {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return probe.status === 0 && probe.stdout.trim().split(/\r?\n/)[0];
}

function exec(cmd, args2) {
  // Windows の .cmd / .ps1 shim を経由する場合、Node 22+ の DEP0190 を避けるため
  // 引数を一旦シェル文字列へ結合して shell: true で渡す（外部入力ではなく固定引数のため安全）
  try {
    if (process.platform === "win32") {
      const quoted = args2.map((a) => /\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a).join(" ");
      const r = spawnSync(`${cmd} ${quoted}`, [], {
        encoding: "utf8", timeout: 15000, shell: true,
      });
      return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
    }
    const r = spawnSync(cmd, args2, { encoding: "utf8", timeout: 15000 });
    return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
  } catch { return { ok: false, out: "", err: "exec failed" }; }
}

const status = {
  codex_cli: null,
  codex_auth: null,
  codex_config: null,
  coderabbit_cli: null,
  coderabbit_app_app: "unknown (check GitHub Settings → Installations)",
  coderabbit_yaml: null,
};

function check() {
  // Codex CLI
  const codex = which("codex");
  if (codex) {
    const v = exec("codex", ["--version"]);
    status.codex_cli = v.ok ? v.out : "installed but version unknown";
    const auth = exec("codex", ["login", "status"]);
    status.codex_auth = auth.ok ? "logged in" : "NOT logged in (run: codex login)";
  } else {
    status.codex_cli = "NOT installed (run: npm install -g @openai/codex)";
    status.codex_auth = "n/a (CLI missing)";
  }
  status.codex_config = fs.existsSync(path.join(PROJECT, ".codex", "config.toml"))
    ? "✅ .codex/config.toml present"
    : fs.existsSync(path.join(PROJECT, ".codex", "config.toml.example"))
      ? "⚠️ only .codex/config.toml.example (copy to config.toml to activate)"
      : "❌ missing (run with --apply)";

  // CodeRabbit
  const cr = which("coderabbit");
  if (cr) {
    const v = exec("coderabbit", ["--version"]);
    status.coderabbit_cli = v.ok ? v.out : "installed";
  } else {
    status.coderabbit_cli = "NOT installed (Windows: iwr -useb https://cli.coderabbit.ai/install.ps1 | iex)";
  }
  status.coderabbit_yaml = fs.existsSync(path.join(PROJECT, ".coderabbit.yaml")) || fs.existsSync(path.join(PROJECT, ".coderabbit.yml"))
    ? "✅ .coderabbit.yaml present"
    : "❌ missing (run with --apply)";
}

function copyIfMissing(src, dst, label) {
  if (fs.existsSync(dst) && !opts.force) {
    console.log(`  ⏭  ${label}: already exists at ${path.relative(PROJECT, dst)} (use --force to overwrite)`);
    return false;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  ✅ ${label}: wrote ${path.relative(PROJECT, dst)}`);
  return true;
}

function apply() {
  console.log(`\n🔧 Applying review configs to ${PROJECT}\n`);
  copyIfMissing(
    path.join(TEMPLATE_DIR, "coderabbit.yaml"),
    path.join(PROJECT, ".coderabbit.yaml"),
    "CodeRabbit config"
  );
  copyIfMissing(
    path.join(TEMPLATE_DIR, "codex-config.toml"),
    path.join(PROJECT, ".codex", "config.toml.example"),
    "Codex config example"
  );

  // .gitignore に .codex/config.toml を追加（実 config は機密）
  const giFile = path.join(PROJECT, ".gitignore");
  if (fs.existsSync(giFile)) {
    const gi = fs.readFileSync(giFile, "utf8");
    if (!gi.includes(".codex/config.toml")) {
      fs.appendFileSync(giFile, "\n# Codex 個人設定（共有テンプレートは .codex/config.toml.example を参照）\n.codex/config.toml\n");
      console.log("  ✅ .gitignore: added .codex/config.toml");
    } else {
      console.log("  ⏭  .gitignore: already excludes .codex/config.toml");
    }
  }
}

function report() {
  console.log("\n📊 Review Tools Diagnosis\n");
  console.log(`Project: ${PROJECT}\n`);
  console.log("🛡️  Codex");
  console.log(`  CLI       : ${status.codex_cli}`);
  console.log(`  Auth      : ${status.codex_auth}`);
  console.log(`  Config    : ${status.codex_config}`);
  console.log("");
  console.log("🐰 CodeRabbit");
  console.log(`  CLI       : ${status.coderabbit_cli}`);
  console.log(`  GitHub App: ${status.coderabbit_app_app}`);
  console.log(`  YAML      : ${status.coderabbit_yaml}`);
  console.log("");
  const missing = [];
  if (status.codex_cli.startsWith("NOT")) missing.push("Codex CLI");
  if (status.codex_auth.startsWith("NOT")) missing.push("Codex auth");
  if (status.codex_config.startsWith("❌")) missing.push("Codex config");
  if (status.coderabbit_cli.startsWith("NOT")) missing.push("CodeRabbit CLI (optional)");
  if (status.coderabbit_yaml.startsWith("❌")) missing.push("CodeRabbit YAML");
  if (missing.length) {
    console.log(`⚠️  Missing: ${missing.join(", ")}`);
    if (!opts.apply) console.log("    Run with --apply to install config files.");
  } else {
    console.log("✅ All review tools configured.");
  }
}

function main() {
  check();
  if (opts.apply) {
    apply();
    check();  // apply 後の状態を再診断
  }
  report();
}

if (require.main === module) main();

module.exports = { check, apply };
