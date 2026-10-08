#!/bin/bash
# ARELM server launcher (used by launchd for persistent background operation)
#
# Node の場所を決め打ちにしていたため、nvm で Node を入れ替える（v22.17.1 が消える）と、
# サーバーが一切起動しなくなり、アプリも「サーバーにアクセスできない」で止まっていた。
# 決めた場所に無ければ、他の場所の Node を探して使う（launchd は PATH が短いので、場所を並べて探す）。

TOOL_DIR="/Users/ari/Developer/AReGLM"
[ -d "$TOOL_DIR/server" ] || TOOL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$TOOL_DIR/server" || exit 1

NODE_BIN="/Users/ari/.nvm/versions/node/v22.17.1/bin/node"
if [ ! -x "$NODE_BIN" ]; then
    NODE_BIN=""
    for CAND in $(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V -r) \
                /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null)"; do
        if [ -n "$CAND" ] && [ -x "$CAND" ]; then NODE_BIN="$CAND"; break; fi
    done
fi
if [ -z "$NODE_BIN" ]; then
    echo "ARELM: Node が見つかりません（~/.nvm・/opt/homebrew・/usr/local を探しました）" >&2
    exit 1
fi
exec "$NODE_BIN" index.js
