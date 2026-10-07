#!/bin/bash
# ARELM server launcher (used by launchd and 見張り.sh for persistent background operation)
#
# フォルダの場所もNodeの版も決め打ちにしない。
# 別のMacや、Nodeを入れ直したあとでも、そのまま立ち上がるようにする。
TOOL="$(cd "$(dirname "$0")" && pwd)"
cd "$TOOL/server" || exit 1

NODE_BIN=""
for c in "$HOME/.nvm/versions/node/v22.17.1/bin/node" \
         "$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)" \
         /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then NODE_BIN="$c"; break; fi
done
if [ -z "$NODE_BIN" ]; then
    echo "node が見つかりません。https://nodejs.org から LTS を入れてください。" >&2
    exit 1
fi

# node_modules は同期の対象外なので、無ければここで入れる
if [ ! -f node_modules/express/package.json ]; then
    NPM_BIN="$(dirname "$NODE_BIN")/npm"
    [ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm 2>/dev/null)"
    if [ -n "$NPM_BIN" ]; then
        PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" install --no-audit --no-fund
    fi
fi

exec "$NODE_BIN" index.js
