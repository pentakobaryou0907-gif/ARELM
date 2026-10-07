#!/bin/bash
# ARELM ランチャー
#
# ダブルクリックすると:
#   1. サーバーと自作AIが止まっていれば起動する
#   2. Chrome のアプリモードで開く（アドレスバーが出ないので、
#      画面上部にはサイト名だけが表示される）
#
# Chrome が無い場合は既定のブラウザで開く。

TOOL_DIR="/Users/ari/Developer/AReGLM"
UID_NUM=$(id -u)

# アプリ専用の入口（8090）で開く。
#
# なぜ 8080 ではないのか:
#   以前のバージョンが 8080 に残したキャッシュのせいで、
#   直しても古い画面が出続けることがあった。
#   （スクロールできなかったのはこれが原因）
#   ブラウザのキャッシュはポートごとに別扱いなので、
#   別のポートなら、その影響を受けない。
#
# なぜ HTTPS ではないのか:
#   127.0.0.1 はポートが違ってもマイクが使える扱いになる。
#   HTTPS だと証明書の警告が出て、アプリの窓では回避しづらい。
#
# つまりこの入口が、警告なし・マイク可・キャッシュの影響なし で最も確実。
# README.md は開かない。アプリ枠（本編の画面）を開く。
BASE="http://127.0.0.1:8090"
URL="$BASE/アプリ枠.html"

start_service() {
    local label="$1" plist="$2"
    launchctl kickstart -k "gui/$UID_NUM/$label" 2>/dev/null \
        || launchctl bootstrap "gui/$UID_NUM" "$plist" 2>/dev/null
}

# --- サーバー ---
if ! curl -s -m 2 "http://127.0.0.1:8080/api/health" > /dev/null 2>&1; then
    start_service "com.ari.areglm.server" "$HOME/Library/LaunchAgents/com.ari.areglm.server.plist"
    for _ in $(seq 1 15); do
        sleep 1
        curl -s -m 2 "http://127.0.0.1:8080/api/health" > /dev/null 2>&1 && break
    done
fi

# --- 自作AI（無くてもツールは使えるので待ちすぎない） ---
if ! curl -s -m 2 "http://127.0.0.1:8765/health" > /dev/null 2>&1; then
    start_service "com.ari.areglm.ai" "$HOME/Library/LaunchAgents/com.ari.areglm.ai.plist"
fi

# --- サーバーが起動しなかった場合は知らせる ---
if ! curl -s -m 2 "http://127.0.0.1:8080/api/health" > /dev/null 2>&1; then
    osascript -e 'display alert "ARELM を起動できませんでした" message "サーバーが応答しません。ログを確認してください:\n~/Developer/AReGLM/server_launchd.log" as critical' 2>/dev/null
    exit 1
fi

# --- アプリ用の入口が応答しなければ、従来の入口で開く ---
if ! curl -s -m 3 "http://127.0.0.1:8090/api/health" > /dev/null 2>&1; then
    BASE="http://127.0.0.1:8080"
fi
URL="$BASE/アプリ枠.html"
curl -s -m 2 -o /dev/null "$URL" || URL="$BASE/"

# --- Chrome のアプリ窓で開く（タブバー無し。中身のスクロールは本編側で行う） ---
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -x "$CHROME_BIN" ]; then
    "$CHROME_BIN" --app="$URL" >/dev/null 2>&1 &
elif [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app="$URL"
else
    open "$URL"
fi
