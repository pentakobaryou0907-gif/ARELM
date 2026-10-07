#!/usr/bin/env bash
# Cloud Agent / ローカル検証用: 自作AI → Node ゲートウェイの順に起こす
set -euo pipefail
cd /workspace 2>/dev/null || cd "$(dirname "$0")/.." || exit 1

# 自作AI（すでに動いていれば start_ai.sh が何もしない）
if [ -x server/ai/start_ai.sh ]; then
  bash server/ai/start_ai.sh || true
fi

# Node ゲートウェイを前面で保持（start の成否が分かるように）
exec bash start_server.sh
