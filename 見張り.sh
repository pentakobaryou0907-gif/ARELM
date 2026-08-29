#!/bin/bash
#
# 見張り
#
# サーバーが落ちていないかを見て、落ちていたら黙って立て直す。
#
# なぜアプリ本体と分けているのか:
#   アプリ自身が動き続けていると、macOS が「すでに起動している」と
#   判断し、二度目のダブルクリックで何も起きなくなる。
#   見張りだけを別に動かせば、アプリはすぐ終われるので、
#   いつダブルクリックしても必ず画面が開く。
#
# 二重に動かないよう、目印のファイルで見張っている。

set -u
TOOL="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$HOME/Library/Logs/AReGLM"
mkdir -p "$LOGDIR"
LOCK="$LOGDIR/見張り.pid"

# すでに動いていれば、何もしないで終わる
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
    exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

PY_BIN="$(ls /Users/ari/.pyenv/versions/*/bin/python3 2>/dev/null | tail -1)"
[ -x "$PY_BIN" ] || PY_BIN="$(command -v python3)"

alive() { curl -s -m 2 -o /dev/null "$1" 2>/dev/null; }

while true; do
    if ! alive "http://127.0.0.1:8080/api/health"; then
        cd "$TOOL" && nohup /bin/bash "$TOOL/start_server.sh" >> "$LOGDIR/server.log" 2>&1 &
        sleep 3
    fi
    if ! alive "http://127.0.0.1:8765/health"; then
        cd "$TOOL/server/ai" && nohup "$PY_BIN" "$TOOL/server/ai/server.py" >> "$LOGDIR/ai.log" 2>&1 &
        sleep 6
    fi
    # 5秒ごとに見る。
    #
    # 30秒おきにしていたところ、
    # 画面から入れ直したときに30秒も落ちたままになっていた。
    # 「こちらでやります」と言って30秒待たせるのでは、
    # 自分でやったほうが早い、ということになる。
    #
    # 5秒ごとに見ても、curl 一回ぶんの負荷しかない。
    sleep 5
done
