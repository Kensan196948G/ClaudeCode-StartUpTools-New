#!/bin/bash
# 並列 Cron ランチャー — CTO + QA 同時起動
# 使い方: ./launch-parallel-cron.sh <ProjectName> [--dry-run]
# 例:     ./launch-parallel-cron.sh MyProject
#         ./launch-parallel-cron.sh MyProject --dry-run   # 検証のみ（実際には起動しない）

set -euo pipefail

DRY_RUN=false
for arg in "$@"; do
  [ "$arg" = "--dry-run" ] && DRY_RUN=true
done

PROJECT="${1:?使い方: $0 <ProjectName> [--dry-run]}"
[ "$PROJECT" = "--dry-run" ] && { echo "ERROR: ProjectName を先に指定してください"; exit 1; }
ROLES_DIR="${HOME}/.claudeos/roles"
LOGS_DIR="${HOME}/.claudeos/logs"
PID_FILE="${HOME}/.claudeos/${PROJECT}-parallel.pid"
LOCK_FILE="/tmp/.claudeos-parallel-${PROJECT}.lock"

mkdir -p "$LOGS_DIR"

# 二重起動防止
if [ -f "$LOCK_FILE" ]; then
  PREV_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$PREV_PID" ] && kill -0 "$PREV_PID" 2>/dev/null; then
    echo "[ParallelCron] 既に起動中です (PID=$PREV_PID). 終了します。"
    exit 1
  fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

# ロールファイルの確認
CTO_ROLE="$ROLES_DIR/cto-build.md"
QA_ROLE="$ROLES_DIR/qa-monitor.md"

if [ ! -f "$CTO_ROLE" ]; then
  echo "[ParallelCron] ERROR: CTO ロールファイルが見つかりません: $CTO_ROLE"
  echo "  Claude/templates/claudeos/roles/cto-build.md を ~/.claudeos/roles/ にコピーしてください"
  exit 1
fi
if [ ! -f "$QA_ROLE" ]; then
  echo "[ParallelCron] ERROR: QA ロールファイルが見つかりません: $QA_ROLE"
  exit 1
fi

echo "[ParallelCron] ===== 並列セッション起動 ====="
echo "[ParallelCron] プロジェクト: $PROJECT"
echo "[ParallelCron] 開始時刻: $(date '+%Y-%m-%d %H:%M:%S')"
$DRY_RUN && echo "[ParallelCron] ⚠️  DRY-RUN モード — 実際のセッションは起動しません"

CTO_LOG="$LOGS_DIR/${PROJECT}-cto-$(date +%Y%m%d-%H%M%S).log"
QA_LOG="$LOGS_DIR/${PROJECT}-qa-$(date +%Y%m%d-%H%M%S).log"

if $DRY_RUN; then
  echo "[ParallelCron] 🟦 CTO セッション: claude -p \"\$(cat $CTO_ROLE)\" --output-format stream-json > $CTO_LOG &"
  echo "[ParallelCron] ⏳ QA セッション: 5分後に起動予定"
  echo "[ParallelCron] 🟩 QA  セッション: claude -p \"\$(cat $QA_ROLE)\" --output-format stream-json > $QA_LOG &"
  echo "[ParallelCron] ✅ DRY-RUN 完了 — セットアップに問題はありません"
  echo ""
  echo "[ParallelCron] 実際の起動コマンド:"
  echo "  $0 $PROJECT"
  exit 0
fi

# CTO セッション起動（バックグラウンド）
echo "[ParallelCron] 🟦 CTO セッション起動中..."
claude -p "$(cat "$CTO_ROLE")" \
  --output-format stream-json \
  > "$CTO_LOG" 2>&1 &
CTO_PID=$!
echo "[ParallelCron]   CTO PID=$CTO_PID → $CTO_LOG"

# QA セッションは5分後に起動（CTO が先行して状態を確立するため）
echo "[ParallelCron] ⏳ QA セッション起動まで 5 分待機..."
sleep 300

echo "[ParallelCron] 🟩 QA セッション起動中..."
claude -p "$(cat "$QA_ROLE")" \
  --output-format stream-json \
  > "$QA_LOG" 2>&1 &
QA_PID=$!
echo "[ParallelCron]   QA PID=$QA_PID → $QA_LOG"

# PID ファイル保存
echo "CTO_PID=$CTO_PID QA_PID=$QA_PID STARTED=$(date -Iseconds)" > "$PID_FILE"

# 完了待機（最大 5 時間）
echo "[ParallelCron] 両セッションの完了を待機中 (最大 300 分)..."
timeout 18000 bash -c "wait $CTO_PID; wait $QA_PID" 2>/dev/null || true

echo "[ParallelCron] ===== セッション完了 ====="
echo "[ParallelCron] CTO ログ: $CTO_LOG"
echo "[ParallelCron] QA  ログ: $QA_LOG"
echo "[ParallelCron] 完了時刻: $(date '+%Y-%m-%d %H:%M:%S')"

# GitHub Issues の未処理メッセージ確認
echo ""
echo "[ParallelCron] 未処理 Agent メッセージ:"
gh issue list --label "agent-msg,status:open" --limit 5 2>/dev/null || echo "  (確認できません)"
