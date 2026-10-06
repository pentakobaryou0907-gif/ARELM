#!/bin/bash
# AReGLM を動かす・作り続けるのに要るものを揃える（Mac版）
#
# 入れるのはすべて無料で、公式の配布元から取る:
#   Xcode コマンドラインツール（git・python3・swift） … Apple
#   Node.js LTS                                     … nodejs.org（SHA-256 を確かめてから入れる）
#   numpy・Pillow（任意で faster-whisper）           … PyPI
#   ffmpeg（任意）                                   … Homebrew があるときだけ
# 終わったら、デスクトップに AReGLM を置く。
# アカウントや鍵（GitHub・SwitchBot・SUZURI など）は、ご自身で作って設定に入れてください。

set -u
TOOL="$(cd "$(dirname "$0")" && pwd)"
cd "$TOOL" || exit 1
MISSING=()

ask() {
    local ans
    read -r -p "$1 [y/N] " ans
    [[ "$ans" =~ ^([yY]|はい) ]]
}

echo "== AReGLM の準備 =="
echo

# --- Xcode コマンドラインツール ---
if xcode-select -p >/dev/null 2>&1; then
    echo "✓ Xcode コマンドラインツール"
else
    echo "… Xcode コマンドラインツールを入れます（出てきた画面で「インストール」を押してください）"
    xcode-select --install 2>/dev/null
    for _ in $(seq 1 360); do
        sleep 5
        xcode-select -p >/dev/null 2>&1 && break
    done
    if xcode-select -p >/dev/null 2>&1; then echo "✓ Xcode コマンドラインツール"; else MISSING+=("Xcode コマンドラインツール"); fi
fi

# --- Node.js ---
find_node() {
    for c in "$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)" \
             /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node 2>/dev/null)"; do
        if [ -n "$c" ] && [ -x "$c" ] && [ "$("$c" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]; then
            echo "$c"; return 0
        fi
    done
    return 1
}
NODE_BIN="$(find_node)"
if [ -n "$NODE_BIN" ]; then
    echo "✓ Node.js $("$NODE_BIN" -v)"
else
    echo "… Node.js（LTS）を nodejs.org から入れます"
    WORK="$(mktemp -d)"
    VER="$(curl -fsSL https://nodejs.org/dist/index.json | /usr/bin/python3 -c 'import json,sys; print(next(x["version"] for x in json.load(sys.stdin) if x["lts"]))' 2>/dev/null)"
    if [ -n "$VER" ] && curl -fsSL -o "$WORK/node.pkg" "https://nodejs.org/dist/$VER/node-$VER.pkg" \
        && curl -fsSL -o "$WORK/SHASUMS256.txt" "https://nodejs.org/dist/$VER/SHASUMS256.txt"; then
        WANT="$(grep " node-$VER.pkg\$" "$WORK/SHASUMS256.txt" | awk '{print $1}')"
        GOT="$(shasum -a 256 "$WORK/node.pkg" | awk '{print $1}')"
        if [ -n "$WANT" ] && [ "$WANT" = "$GOT" ]; then
            osascript -e "do shell script \"installer -pkg '$WORK/node.pkg' -target /\" with administrator privileges" >/dev/null \
                && echo "✓ Node.js $VER を入れました"
        else
            echo "✗ 落としたファイルの確認（SHA-256）が合わなかったので、入れませんでした"
        fi
    fi
    rm -rf "$WORK"
    NODE_BIN="$(find_node)"
    [ -n "$NODE_BIN" ] || MISSING+=("Node.js（https://nodejs.org の LTS）")
fi

# --- サーバーの部品 ---
if [ -n "$NODE_BIN" ]; then
    NPM_BIN="$(dirname "$NODE_BIN")/npm"
    (cd server && PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" install --no-audit --no-fund >/dev/null 2>&1) \
        && echo "✓ サーバーの部品（express）" || MISSING+=("サーバーの部品（server で npm install）")
fi

# --- Python と部品 ---
PY_BIN="$(ls "$HOME"/.pyenv/versions/*/bin/python3 2>/dev/null | tail -1)"
[ -x "$PY_BIN" ] || PY_BIN="$(command -v python3)"
if [ -n "$PY_BIN" ] && "$PY_BIN" --version >/dev/null 2>&1; then
    echo "✓ $("$PY_BIN" --version)"
    if "$PY_BIN" -m pip install --user -q -r server/ai/requirements.txt; then
        echo "✓ numpy・Pillow"
    else
        MISSING+=("numpy・Pillow（python3 -m pip install --user -r server/ai/requirements.txt）")
    fi
    if ! "$PY_BIN" -c 'import faster_whisper' 2>/dev/null; then
        if ask "声を文字にする部品（faster-whisper・数百MB）も入れますか？"; then
            "$PY_BIN" -m pip install --user -q -r server/ai/requirements-voice.txt && echo "✓ faster-whisper"
        fi
    else
        echo "✓ faster-whisper"
    fi
else
    MISSING+=("Python 3")
fi

# --- ffmpeg（任意） ---
if command -v ffmpeg >/dev/null 2>&1; then
    echo "✓ ffmpeg"
elif command -v brew >/dev/null 2>&1 && ask "動画の解析に使う ffmpeg を Homebrew で入れますか？"; then
    brew install ffmpeg && echo "✓ ffmpeg"
else
    echo "－ ffmpeg（任意。動画の解析に使う。Homebrew があれば brew install ffmpeg）"
fi

# --- Chrome（任意） ---
if [ -d "/Applications/Google Chrome.app" ]; then
    echo "✓ Google Chrome"
else
    echo "－ Google Chrome（任意。無ければ既定のブラウザで開きます）"
    ask "Chrome の公式ダウンロードページを開きますか？" && open "https://www.google.com/chrome/"
fi

# --- デスクトップに置く ---
echo
bash "$TOOL/ホーム画面に置く.command"

echo
if [ ${#MISSING[@]} -eq 0 ]; then
    echo "準備ができました。"
else
    echo "まだMISSINGもの:"
    printf '  ・%s\n' "${MISSING[@]}"
fi
echo
echo "アカウントと鍵（GitHub・SwitchBot・SUZURI など）は、ご自身で作ってから"
echo "AReGLM の 設定 →「準備の状態」に並んでいる順に入れてください。"
echo
read -r -p "Enter で閉じます" _
