#!/bin/bash
# ARELM をすぐ使えるようにするランチャー
#
# ダブルクリックするだけで:
#   1. サーバーと自作AIエンジンが動いているか確認し、止まっていれば起動する
#   2. 準備ができたらブラウザで開く
#
# すでに動いている場合は、そのまま開くだけなので数秒で立ち上がる。

cd "$(dirname "$0")" || exit 1

BASE="http://127.0.0.1:8080"
UID_NUM=$(id -u)

echo "ARELM を起動します…"
echo "（README.md は説明文です。開くのはアプリ枠の画面です）"
echo

# --- Node ゲートウェイ ---
if curl -s -m 2 "$BASE/api/health" > /dev/null 2>&1; then
    echo "  ✓ サーバー: 稼働中"
else
    echo "  … サーバーを起動しています"
    launchctl kickstart -k "gui/$UID_NUM/com.ari.areglm.server" 2>/dev/null \
        || launchctl bootstrap "gui/$UID_NUM" ~/Library/LaunchAgents/com.ari.areglm.server.plist 2>/dev/null
    for _ in $(seq 1 15); do
        sleep 1
        curl -s -m 2 "$BASE/api/health" > /dev/null 2>&1 && break
    done
    if curl -s -m 2 "$BASE/api/health" > /dev/null 2>&1; then
        echo "  ✓ サーバー: 起動しました"
    else
        echo "  ✗ サーバーを起動できませんでした"
        echo "     ログ: $(pwd)/server_launchd.log"
    fi
fi

# --- 自作AIエンジン ---
if curl -s -m 2 http://127.0.0.1:8765/health > /dev/null 2>&1; then
    echo "  ✓ 自作AI: 稼働中"
else
    echo "  … 自作AIを起動しています"
    launchctl kickstart -k "gui/$UID_NUM/com.ari.areglm.ai" 2>/dev/null \
        || launchctl bootstrap "gui/$UID_NUM" ~/Library/LaunchAgents/com.ari.areglm.ai.plist 2>/dev/null
    for _ in $(seq 1 20); do
        sleep 1
        curl -s -m 2 http://127.0.0.1:8765/health > /dev/null 2>&1 && break
    done
    if curl -s -m 2 http://127.0.0.1:8765/health > /dev/null 2>&1; then
        echo "  ✓ 自作AI: 起動しました"
    else
        # AIが無くてもツール本体は使えるので、止めずに知らせるだけにする
        echo "  △ 自作AIは起動していません（ツール本体は使えます）"
        echo "     ログ: $(pwd)/server/ai/ai_engine.log"
    fi
fi

# アプリ用の入口（8090）があれば優先。アプリ枠が無ければ本編を直接開く。
curl -s -m 2 "http://127.0.0.1:8090/api/health" > /dev/null 2>&1 && BASE="http://127.0.0.1:8090"
URL="$BASE/アプリ枠.html"
curl -s -m 2 -o /dev/null "$URL" || URL="$BASE/"

echo
echo "アプリ画面を開きます: $URL"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -x "$CHROME_BIN" ]; then
    "$CHROME_BIN" --app="$URL" >/dev/null 2>&1 &
elif [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$URL"
else
    open "$URL"
fi

# 他の端末から使うためのアドレスも出しておく
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -n "$LAN_IP" ]; then
    echo "同じWi-Fi内の他の端末からは: http://$LAN_IP:8080"
fi

echo
echo "このウィンドウは閉じても構いません。"
sleep 2
