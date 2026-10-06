#!/bin/bash
# デスクトップ（ホーム画面）とアプリケーションに、AReGLM.app を作り直して置く（Mac版）
#
# 以前の AReGLM.app は、中のスクリプトが自分自身（~/Applications/AReGLM.app）を
# 開き直していたため、押しても開かない・同じ処理を繰り返すことがあった。
# ここで作るアプリは、このフォルダの 見張り.sh を裏で起こし、サーバーの応答を
# 待ってからログイン画面を開いて、すぐ終わる。自分自身は開かない。
#
# 前からある AReGLM は消さずに「使用済み」へ移す。

set -u
TOOL="$(cd "$(dirname "$0")" && pwd)"
SUPPORT="$HOME/Library/Application Support/AReGLM"
USED="$SUPPORT/使用済み"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

if [ ! -f "$TOOL/見張り.sh" ] || [ ! -f "$TOOL/server/index.js" ]; then
    osascript -e 'display alert "AReGLM" message "ツールのフォルダの中から開いてください。" as critical' 2>/dev/null
    exit 1
fi

echo "AReGLM.app を作っています…"
WORK="$(mktemp -d)"
APP="$WORK/AReGLM.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>AReGLM</string>
    <key>CFBundleDisplayName</key><string>AReGLM</string>
    <key>CFBundleIdentifier</key><string>com.ari.areglm.launcher</string>
    <key>CFBundleExecutable</key><string>AReGLM</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>2.0</string>
    <key>CFBundleVersion</key><string>2</string>
    <key>LSMinimumSystemVersion</key><string>11.0</string>
    <key>LSUIElement</key><true/>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

printf '%s\n' "$TOOL" > "$APP/Contents/Resources/tool-path.txt"
touch "$APP/Contents/Resources/areglm-launcher"

cat > "$APP/Contents/MacOS/AReGLM" <<'LAUNCHER'
#!/bin/bash
# AReGLM.app の中身。見張りを起こし、ログイン画面を開いて、すぐ終わる。
# 自分自身（AReGLM.app）は開かない。開くと押すたびに同じ処理が重なるため。

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TOOL="$(head -n 1 "$HERE/Resources/tool-path.txt" 2>/dev/null)"

if [ ! -f "$TOOL/見張り.sh" ]; then
    for c in "$HOME/Applications/AReGLM.app/Contents/Resources/ツール本体" "$HOME/Developer/AReGLM" "$HOME/Desktop/AReGLM" "$HOME/Documents/AReGLM" "$HOME/AReGLM"; do
        if [ -f "$c/見張り.sh" ] && [ -f "$c/server/index.js" ]; then TOOL="$c"; break; fi
    done
fi
if [ ! -f "$TOOL/見張り.sh" ]; then
    osascript -e 'display alert "AReGLM" message "ツールのフォルダが見つかりませんでした。フォルダの中の「ホーム画面に置く.command」をもう一度開いてください。" as critical'
    exit 1
fi

alive() { curl -s -m 2 -o /dev/null "$1" 2>/dev/null; }

if ! alive "http://127.0.0.1:8080/api/health"; then
    mkdir -p "$HOME/Library/Logs/AReGLM"
    nohup /bin/bash "$TOOL/見張り.sh" >> "$HOME/Library/Logs/AReGLM/見張り.log" 2>&1 < /dev/null &
    disown 2>/dev/null
    for _ in $(seq 1 90); do
        sleep 1
        alive "http://127.0.0.1:8080/api/health" && break
    done
fi

if ! alive "http://127.0.0.1:8080/api/health"; then
    osascript -e 'display alert "AReGLM を開けませんでした" message "サーバーが応答しません。Node.js が入っているか確かめてください。\nログ: ~/Library/Logs/AReGLM/見張り.log" as critical'
    exit 1
fi

URL="http://127.0.0.1:8080/"
alive "http://127.0.0.1:8090/api/health" && URL="http://127.0.0.1:8090/"

if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "/Applications/Google Chrome.app" --new "$URL"
else
    open "$URL"
fi
exit 0
LAUNCHER
chmod +x "$APP/Contents/MacOS/AReGLM"

# アイコンを images/icon-512x512.png から作る（sips と iconutil は macOS に最初から入っている）
SRC="$TOOL/images/icon-512x512.png"
if [ -f "$SRC" ] && command -v iconutil >/dev/null 2>&1; then
    SET="$WORK/AppIcon.iconset"
    mkdir -p "$SET"
    for s in 16 32 128 256 512; do
        sips -z "$s" "$s" "$SRC" --out "$SET/icon_${s}x${s}.png" >/dev/null 2>&1
        d=$((s * 2))
        sips -z "$d" "$d" "$SRC" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null 2>&1
    done
    iconutil -c icns "$SET" -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null
fi

# 前からある AReGLM を「使用済み」へ移す（消さない）
move_old() {
    local p="$1"
    [ -e "$p" ] || return 0
    mkdir -p "$USED"
    local name
    name="$(basename "$p")"
    mv "$p" "$USED/${name%.app}_旧_${STAMP}$( [ "${name##*.}" = app ] && echo .app )"
    echo "  前の $p を「使用済み」へ移しました"
}

DESK="$HOME/Desktop"
mkdir -p "$HOME/Applications"
# ツール本体を中に持っている AReGLM.app（~/Applications/AReGLM.app/Contents/Resources/ツール本体）は
# 触らない。以前これも「前の AReGLM」として使用済みへ移す作りで、本体とデータごと動いてしまうところだった。
holds_tool() {
    case "$TOOL/" in "$1"/*) return 0;; esac
    [ -d "$1/Contents/Resources/ツール本体" ]
}
PLACED=()
for target in "$DESK" "$HOME/Applications"; do
    if [ -e "$target/AReGLM.app" ] && holds_tool "$target/AReGLM.app"; then
        echo "  $target/AReGLM.app はツール本体が入っているので、そのままにします"
        continue
    fi
    move_old "$target/AReGLM.app"
    [ -f "$target/AReGLM" ] && move_old "$target/AReGLM"
    cp -R "$APP" "$target/AReGLM.app"
    xattr -dr com.apple.quarantine "$target/AReGLM.app" 2>/dev/null
    touch "$target/AReGLM.app"
    echo "  置きました: $target/AReGLM.app"
    PLACED+=("$target/AReGLM.app")
done

LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
[ -x "$LSREG" ] && [ ${#PLACED[@]} -gt 0 ] && "$LSREG" -f "${PLACED[@]}" >/dev/null 2>&1
rm -rf "$WORK"

echo
echo "できました。デスクトップの「AReGLM」を開くと、ログイン画面が出ます。"
echo "前の AReGLM は次の場所に残してあります: $USED"
osascript -e 'display notification "デスクトップの AReGLM から開けます" with title "AReGLM"' 2>/dev/null
sleep 2
