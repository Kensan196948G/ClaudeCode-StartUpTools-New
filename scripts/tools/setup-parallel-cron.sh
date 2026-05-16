#!/bin/bash
# parallel-cron セットアップスクリプト
# 使い方: ./scripts/tools/setup-parallel-cron.sh
# Linux サーバーで実行してロールファイルを配置する

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROLES_SRC="$REPO_ROOT/Claude/templates/claudeos/roles"
ROLES_DST="$HOME/.claudeos/roles"
LOGS_DST="$HOME/.claudeos/logs"

echo "=== ClaudeOS parallel-cron セットアップ ==="
echo "ソース: $ROLES_SRC"
echo "配置先: $ROLES_DST"

mkdir -p "$ROLES_DST" "$LOGS_DST"

for role in cto-build.md qa-monitor.md; do
  src="$ROLES_SRC/$role"
  dst="$ROLES_DST/$role"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    echo "✅ $role → $dst"
  else
    echo "❌ 見つかりません: $src"
    exit 1
  fi
done

echo ""
echo "=== セットアップ完了 ==="
echo "次のコマンドで動作確認:"
echo "  bash scripts/tools/launch-parallel-cron.sh MyProject --dry-run"
echo ""
echo "実際の起動:"
echo "  bash scripts/tools/launch-parallel-cron.sh MyProject"
