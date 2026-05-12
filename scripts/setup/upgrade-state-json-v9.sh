#!/usr/bin/env bash
# upgrade-state-json-v9.sh
# Linux (192.168.0.185) 上の登録プロジェクト state.json を v9.0 スキーマへアップグレードする
# Usage: bash upgrade-state-json-v9.sh [PROJECTS_BASE]
# Default PROJECTS_BASE: $HOME/Projects

set -euo pipefail

PROJECTS_BASE="${1:-$HOME/Projects}"
TODAY=$(date +%Y-%m-%d)
RELEASE_DEADLINE=$(date -d "+6 months" +%Y-%m-%d 2>/dev/null || date -v+6m +%Y-%m-%d)

echo "=== ClaudeOS v9.0 state.json アップグレード ==="
echo "Projects base: $PROJECTS_BASE"
echo "Today: $TODAY / Release deadline: $RELEASE_DEADLINE"
echo ""

upgraded=0
skipped=0
errors=0

for project_dir in "$PROJECTS_BASE"/*/; do
    [ -d "$project_dir" ] || continue
    project=$(basename "$project_dir")
    state_file="$project_dir/state.json"

    if [ ! -f "$state_file" ]; then
        echo "[$project] state.json なし — スキップ"
        ((skipped++)) || true
        continue
    fi

    # v9.0 スキーマ確認（project.start_date があれば v9.0 済み）
    if python3 -c "import json,sys; d=json.load(open('$state_file')); sys.exit(0 if 'project' in d and 'start_date' in d.get('project',{}) else 1)" 2>/dev/null; then
        echo "[$project] ✅ v9.0 スキーマ済み — スキップ"
        ((skipped++)) || true
        continue
    fi

    echo "[$project] v8 スキーマ検出 → v9.0 へアップグレード中..."

    # バックアップ作成
    cp "$state_file" "${state_file}.bak.$(date +%Y%m%d%H%M%S)"

    # Python で v9.0 フィールドをマージ（既存値を保持しつつ不足フィールドを追加）
    python3 << PYEOF
import json, sys

with open("$state_file", "r") as f:
    state = json.load(f)

# project セクション（v9.0）
if "project" not in state or not isinstance(state["project"], dict):
    state["project"] = {}
state["project"].setdefault("name", "$project")
state["project"].setdefault("start_date", "$TODAY")
state["project"].setdefault("release_deadline", "$RELEASE_DEADLINE")
state["project"].setdefault("phase_mode", "development")

# goal を文字列に正規化（v8 では dict の場合あり）
if isinstance(state.get("goal"), dict):
    state["goal"] = state["goal"].get("title", "$project 自律開発")
elif not state.get("goal"):
    state["goal"] = "$project 自律開発"

# phase をトップレベルに設定
state.setdefault("phase", "Monitor")

# kpi フィールド追加
if "kpi" not in state:
    state["kpi"] = {}
state["kpi"].setdefault("success_rate_target", 0.9)
state["kpi"].setdefault("ci_success_rate", 0.0)
state["kpi"].setdefault("test_pass_rate", 0.0)
state["kpi"].setdefault("security_critical", 0)
state["kpi"].setdefault("blocker_count", 0)

# execution フィールド追加
if "execution" not in state:
    state["execution"] = {}
state["execution"].setdefault("repair_count", 0)
state["execution"].setdefault("max_repair", 3)
state["execution"].setdefault("same_error_limit", 2)

# 新規フィールド追加
state.setdefault("completed_issues", [])
state.setdefault("blocked_issues", [])

# learning を標準化
if "learning" not in state or not isinstance(state["learning"], dict):
    state["learning"] = {}
state["learning"].setdefault("failure_patterns", [])
state["learning"].setdefault("success_patterns", [])

# quality_gates 追加
if "quality_gates" not in state:
    state["quality_gates"] = {
        "lint": {"warning_threshold": 10, "error_threshold": 0},
        "coverage": {"line_min": 70, "changed_files_min": 80}
    }

with open("$state_file", "w") as f:
    json.dump(state, f, ensure_ascii=False, indent=2)
    f.write("\n")

print("  v9.0 アップグレード完了")
PYEOF

    if [ $? -eq 0 ]; then
        echo "  [$project] ✅ 完了"
        ((upgraded++)) || true
    else
        echo "  [$project] ❌ エラー"
        ((errors++)) || true
    fi
done

echo ""
echo "=== 完了 ==="
echo "アップグレード済み: $upgraded 件"
echo "スキップ（v9.0済み or state.json なし）: $skipped 件"
echo "エラー: $errors 件"
