#!/usr/bin/env node
// quality-gate-check.js (ClaudeOS v8.2+)
// Verify フェーズ終了時に lint warning / coverage を読み取り、閾値を超えていれば
// state.warnings[] へ kind="quality_gate_breach" を追加する fail-soft hook。
//
// 入力（任意で存在）:
//   - reports/lint-summary.json   { errors: number, warnings: number }
//   - reports/coverage-summary.json { line: number, branch?: number, changed_files?: number }
//
// state.json:
//   - state.quality_gates で閾値を上書き可
//   - 未定義時は既定値（warning 10 / error 0 / coverage 70 / changed 80）

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  lint: { warning_threshold: 10, error_threshold: 0 },
  coverage: { line_min: 70, changed_files_min: 80 },
};

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function getThresholds(state) {
  const qg = (state && state.quality_gates) || {};
  return {
    lint: Object.assign({}, DEFAULTS.lint, qg.lint || {}),
    coverage: Object.assign({}, DEFAULTS.coverage, qg.coverage || {}),
  };
}

function evaluate(cwd, state) {
  const reportsDir = path.join(cwd, "reports");
  const lintFile = path.join(reportsDir, "lint-summary.json");
  const covFile  = path.join(reportsDir, "coverage-summary.json");
  const t = getThresholds(state);
  const breaches = [];

  const lint = readJson(lintFile);
  if (lint) {
    if (Number(lint.errors || 0) > t.lint.error_threshold) {
      breaches.push({ gate: "lint_error", observed: Number(lint.errors), threshold: t.lint.error_threshold });
    }
    if (Number(lint.warnings || 0) > t.lint.warning_threshold) {
      breaches.push({ gate: "lint_warning", observed: Number(lint.warnings), threshold: t.lint.warning_threshold });
    }
  }

  const cov = readJson(covFile);
  if (cov) {
    const line = Number(cov.line);
    if (!Number.isNaN(line) && line < t.coverage.line_min) {
      breaches.push({ gate: "coverage_line", observed: line, threshold: t.coverage.line_min });
    }
    const changed = Number(cov.changed_files);
    if (!Number.isNaN(changed) && changed < t.coverage.changed_files_min) {
      breaches.push({ gate: "coverage_changed_files", observed: changed, threshold: t.coverage.changed_files_min });
    }
  }

  return breaches;
}

function appendWarnings(state, breaches) {
  if (!breaches.length) return false;
  state.warnings = state.warnings || [];
  state.warnings.push({
    at: new Date().toISOString(),
    kind: "quality_gate_breach",
    message: `Quality gates breached: ${breaches.map(b => b.gate).join(", ")}`,
    breaches,
  });
  return true;
}

module.exports = { evaluate, appendWarnings, getThresholds, DEFAULTS };

if (require.main === module) {
  const cwd = process.cwd();
  const stateFile = path.join(cwd, "state.json");
  const state = readJson(stateFile) || {};
  const breaches = evaluate(cwd, state);
  if (breaches.length) {
    console.log("[QualityGate] breaches:", JSON.stringify(breaches, null, 2));
    process.exit(1);
  } else {
    console.log("[QualityGate] all gates passed (or no reports found)");
    process.exit(0);
  }
}
