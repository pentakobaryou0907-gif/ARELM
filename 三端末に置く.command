#!/bin/bash
# Mac / Windows / iPad の三端末で AReGLM を使えるようにする（Mac側で実行）
#
# できること（この Mac 上）:
#   1. ホーム画面（デスクトップ）と Applications に AReGLM.app を置く
#   2. HTTPS 証明書が無ければ作る（iPad のマイク用）
#   3. サーバーを起こす
#   4. Windows / iPad 向けの次の手順を画面に出す
#
# できないこと（ご本人の端末操作が必要）:
#   - Windows のデスクトップにアイコンを置く（AReGLMをホーム画面に置く.bat）
#   - iPad のホーム画面に追加（Safari の「ホーム画面に追加」）
#   - Tailscale のインストールとログイン

set -u
TOOL="$(cd "$(dirname "$0")" && pwd)"
cd "$TOOL" || exit 1

osascript -e 'display notification "三端末の準備を始めます" with title "AReGLM"' 2>/dev/null || true

# --- 1. Mac ホーム画面 ---
if [ -x "$TOOL/ホーム画面に置く.command" ]; then
    echo "=== Mac: ホーム画面に AReGLM.app を置きます ==="
    bash "$TOOL/ホーム画面に置く.command" || true
else
    echo "ホーム画面に置く.command がありません。"
fi

# --- 2. HTTPS 証明書（iPad / マイク） ---
if [ ! -f "$TOOL/server/certs/cert.pem" ] || [ ! -f "$TOOL/server/certs/key.pem" ]; then
    echo "=== HTTPS 証明書を作ります（iPad用） ==="
    if [ -x "$TOOL/server/certs/make-cert.sh" ]; then
        bash "$TOOL/server/certs/make-cert.sh" || true
    fi
else
    echo "HTTPS 証明書: あり"
fi

# --- 3. サーバー ---
if [ -x "$TOOL/見張り.sh" ]; then
    echo "=== サーバー（見張り）を起こします ==="
    nohup bash "$TOOL/見張り.sh" >/dev/null 2>&1 &
    sleep 2
fi
if [ -x "$TOOL/start_server.sh" ]; then
    if ! curl -s -m 2 http://127.0.0.1:8080/api/health >/dev/null 2>&1 \
       && ! curl -s -m 2 http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
        nohup bash "$TOOL/start_server.sh" >/tmp/areglm-start.log 2>&1 &
        sleep 3
    fi
fi

# --- 4. 住所を集めて案内 ---
LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
TS=""
if command -v tailscale >/dev/null 2>&1; then
    TS="$(tailscale ip -4 2>/dev/null | head -1 || true)"
fi
HTTPS=8443
APP=8090
curl -s -m 2 "http://127.0.0.1:${APP}/api/health" >/dev/null 2>&1 || APP=8080

案内="$TOOL/三端末_次にやること.txt"
{
    echo "AReGLM 三端末セットアップ（$(date '+%Y-%m-%d %H:%M')）"
    echo ""
    echo "【Mac】できました"
    echo "  デスクトップ / アプリケーション の AReGLM.app を開いてください。"
    echo ""
    echo "【Windows】"
    echo "  1. GitHub（ログイン済み）からブランチ cursor/three-devices-home-1936 の ZIP を落とす"
    echo "     または Mac と同じツール本体を Syncthing で同期する"
    echo "  2. OneDrive\\デスクトップ\\AReGLM\\ツール本体 に入れる"
    echo "  3. AReGLMをホーム画面に置く.bat を開く"
    echo "  4. デスクトップの AReGLM から開く（この Windows でもサーバーが動きます）"
    echo "  ※ iPad からも同じデータを使うなら、Mac 側で Tailscale を入にし、"
    echo "     Windows は Tailscale 経由で Mac を開いても構いません。"
    echo ""
    echo "【iPad】"
    echo "  1. App Store から Tailscale を入れ、Mac と同じアカウントでログイン"
    echo "  2. Mac の AReGLM → 設定 → 他の端末 →「Tailscaleから使えるようにする」"
    echo "     （合言葉を決める）"
    if [ -n "$TS" ]; then
        echo "  3. Safari で次を開く:"
        echo "       https://${TS}:${HTTPS}"
        echo "     （ダメなら http://${TS}:${APP} ）"
    elif [ -n "$LAN" ]; then
        echo "  3. 同じWi-Fiなら Safari で次を開く:"
        echo "       https://${LAN}:${HTTPS}"
        echo "     （ダメなら http://${LAN}:${APP} ）"
    else
        echo "  3. Mac の画面に出た Tailscale / LAN の住所を Safari で開く"
    fi
    echo "  4. 合言葉を入れる"
    echo "  5. 共有ボタン →「ホーム画面に追加」→ 追加"
    echo "  6. ホーム画面の ARELM から開く"
    echo ""
    echo "詳しくは 三端末に置く.txt も見てください。"
} > "$案内"

open -a TextEdit "$案内" 2>/dev/null || open "$案内" 2>/dev/null || cat "$案内"
osascript -e 'display alert "AReGLM" message "Mac のホーム画面への配置は終わりました。\nWindows と iPad は「三端末_次にやること.txt」の手順を実行してください。" as informational' 2>/dev/null || true

echo "完了。案内: $案内"
