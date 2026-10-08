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
# なぜ 127.0.0.1 ではなく localhost なのか:
#   指紋・Face IDで開く機能（パスキー）は、IPアドレスのサイトでは使えず、
#   localhost なら使える。localhost もマイクが使える扱いになる。
#   （古いブックマークで 127.0.0.1 から開いても、画面側が自動で localhost へ移る）
#
# なぜ HTTPS ではないのか:
#   localhost はポートが違ってもマイクが使える扱いになる。
#   HTTPS だと証明書の警告が出て、アプリの窓では回避しづらい。
#
# つまりこの入口が、警告なし・マイク可・キャッシュの影響なし で最も確実。
URL="http://localhost:8090"

start_service() {
    local label="$1" plist="$2"
    launchctl kickstart -k "gui/$UID_NUM/$label" 2>/dev/null \
        || launchctl bootstrap "gui/$UID_NUM" "$plist" 2>/dev/null
}

# ARELM が答えているか。8080 は、同じMacの別のアプリ（エディタ等）が先に持つことがあり、
# そのアプリの返事を「動いている」と取り違えて、止まった ARELM を起こさないまま開いていた。
# 返事の中身に ARELM があるかで見分ける。
arelm_alive() { curl -s -m 2 "http://127.0.0.1:$1/api/health" 2>/dev/null | grep -q 'ARELM'; }
LOGDIR="$HOME/Library/Logs/AReGLM"
mkdir -p "$LOGDIR"

# --- サーバー ---
if ! arelm_alive 8090 && ! arelm_alive 8080; then
    start_service "com.ari.areglm.server" "$HOME/Library/LaunchAgents/com.ari.areglm.server.plist"
    for _ in $(seq 1 15); do
        sleep 1
        arelm_alive 8090 && break
    done
    # launchd の設定が消えた・壊れたときは、launchd では起きない。直接起こす
    if ! arelm_alive 8090 && ! arelm_alive 8080; then
        (cd "$TOOL_DIR" && nohup /bin/bash "$TOOL_DIR/start_server.sh" >> "$LOGDIR/server.log" 2>&1 &)
        for _ in $(seq 1 15); do
            sleep 1
            arelm_alive 8090 && break
        done
    fi
fi

# --- 自作AI（無くてもツールは使えるので待ちすぎない） ---
if ! curl -s -m 2 "http://127.0.0.1:8765/health" > /dev/null 2>&1; then
    start_service "com.ari.areglm.ai" "$HOME/Library/LaunchAgents/com.ari.areglm.ai.plist"
fi

# --- サーバーが起動しなかった場合は知らせる ---
# 以前は「ログを確認してください」だけで、理由も、次にどうすればよいかも分からなかった。
# ログの最後を見せ、Macが無くても使える公開先をボタン一つで開けるようにする。
if ! arelm_alive 8090 && ! arelm_alive 8080; then
    LOGTAIL=$( { tail -n 6 "$LOGDIR/server.log"; tail -n 6 "$TOOL_DIR/server_launchd.log"; } 2>/dev/null | tail -n 8 | tr -d '"\\' | cut -c1-160 )
    CHOICE=$(osascript -e "display dialog \"サーバーが応答しません。

最後の記録:
${LOGTAIL:-（記録がありません）}

Macが無くても、公開先で開けます。\" with title \"ARELM を起動できませんでした\" buttons {\"閉じる\", \"公開先で開く\"} default button \"公開先で開く\" with icon caution" 2>/dev/null)
    case "$CHOICE" in
        *公開先で開く*) open "https://pentakobaryou0907-gif.github.io/ARELM/" ;;
    esac
    exit 1
fi

# --- アプリ用の入口が応答しなければ、従来の入口で開く ---
if ! arelm_alive 8090; then
    URL="http://localhost:8080"
fi

# --- Chrome で開く ---
#
# 以前は --app（アドレスバーの無い窓）で開いていたが、
# その窓ではスクロールできない不具合が出た。
# 普通のタブでは問題なく動くため、普通の窓で開くようにする。
#
# また open -n（新しいChromeをもう一つ起動する）もやめる。
# すでにChromeが動いているときに二重起動すると、
# 指定したアドレスが無視されることがあるため。
CHROME="/Applications/Google Chrome.app"
if [ -d "$CHROME" ]; then
    open -a "$CHROME" --new "$URL"
else
    open "$URL"
fi
