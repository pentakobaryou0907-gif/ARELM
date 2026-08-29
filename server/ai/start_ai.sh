#!/bin/bash
# 自作AIエンジンの起動スクリプト
# 二重起動を避けるため、すでに動いている場合は何もしない。

cd "$(dirname "$0")" || exit 1

if curl -s -m 2 http://127.0.0.1:8765/health > /dev/null 2>&1; then
    echo "自作AIエンジンはすでに起動しています (http://127.0.0.1:8765)"
    exit 0
fi

echo "自作AIエンジンを起動します…"
nohup python3 server.py > ai_engine.log 2>&1 &
sleep 2

if curl -s -m 3 http://127.0.0.1:8765/health > /dev/null 2>&1; then
    echo "起動しました: http://127.0.0.1:8765"
    echo "ログ: $(pwd)/ai_engine.log"
else
    echo "起動に失敗しました。ログを確認してください: $(pwd)/ai_engine.log"
    exit 1
fi
