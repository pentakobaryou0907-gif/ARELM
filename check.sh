#!/bin/bash

# 自作AIは numpy を使うため、numpy が入っている Python で試す必要がある。
# 常駐設定（launchd）が実際に使っているものと同じものを選ぶ。
AI_PYTHON="$(ls /Users/ari/.pyenv/versions/*/bin/python3 2>/dev/null | tail -1)"
if [ -z "$AI_PYTHON" ] || [ ! -x "$AI_PYTHON" ]; then
    AI_PYTHON="python3"
fi
# ARELM 全体の健全性チェック
#
# 細かいミスで作業が止まらないよう、変更後にこれを実行する。
#   ./check.sh
#
# 検査する内容:
#   1. JavaScript の構文
#   2. Python の構文
#   3. HTML から読む JS ファイルが実在するか
#   4. HTML の id が重複していないか
#   5. 呼んでいる関数が定義されているか
#   6. サーバーが動いているか
#   7. 自作AIの自動テスト
#  10. 門番（よそのサイト・よその名前・中継からの送り方で断られるか）
#  11. 画面の主な流れ（tools で npm install すると動く）

cd "$(dirname "$0")" || exit 1

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
FAIL=0

ok()   { echo -e "${GREEN}  OK${NC}  $1"; }
ng()   { echo -e "${RED}  NG${NC}  $1"; FAIL=1; }
warn() { echo -e "${YELLOW}  --${NC}  $1"; }

echo "════════════════════════════════════════"
echo " ARELM 健全性チェック"
echo "════════════════════════════════════════"

# --- 1. JavaScript 構文 ---
echo
echo "[1] JavaScript の構文"
JS_BAD=0
for f in js/main.js js/app-bootstrap.js js/modules/*.js js/services/*.js js/core/*.js js/config/*.js server/index.js; do
    [ -f "$f" ] || continue
    if ! node --check "$f" >/dev/null 2>&1; then
        ng "$f"
        node --check "$f" 2>&1 | head -3 | sed 's/^/        /'
        JS_BAD=1
    fi
done
[ $JS_BAD -eq 0 ] && ok "全ファイル構文エラーなし"

# --- 2. Python 構文 ---
echo
echo "[2] Python の構文"
PY_BAD=0
for f in server/ai/*.py; do
    [ -f "$f" ] || continue
    if ! python3 -m py_compile "$f" 2>/dev/null; then
        ng "$f"
        PY_BAD=1
    fi
done
[ $PY_BAD -eq 0 ] && ok "全ファイル構文エラーなし"

# --- 3. 読み込むファイルの実在 ---
echo
echo "[3] HTML が読み込む JS の実在"
MISSING=0
while read -r p; do
    [ -z "$p" ] && continue
    if [ ! -f "$p" ]; then ng "存在しない: $p"; MISSING=1; fi
done < <(grep -o 'src="js/[^"]*"' index.html | sed 's/src="//;s/"//')
[ $MISSING -eq 0 ] && ok "全て実在する"

# --- 4. id の重複 ---
echo
echo "[4] HTML の id 重複"
DUP=$(grep -o 'id="[^"]*"' index.html | sort | uniq -d)
if [ -n "$DUP" ]; then
    ng "重複あり:"; echo "$DUP" | sed 's/^/        /'
else
    ok "重複なし"
fi

# --- 5. 呼んでいる関数の定義 ---
echo
echo "[5] app-bootstrap が呼ぶ init 関数の定義"
UNDEF=0
while read -r fn; do
    [ -z "$fn" ] && continue
    if ! grep -rqE "function $fn\(" js/ 2>/dev/null; then
        ng "未定義: $fn"; UNDEF=1
    fi
done < <(grep -oE "typeof (init[A-Za-z]+) === 'function'" js/app-bootstrap.js | awk '{print $2}' | sort -u)
[ $UNDEF -eq 0 ] && ok "全て定義済み"

# --- 5a. 読み込み時に壊れる問題 ---
echo
echo "[5a] 名前の衝突・読み込み順・未定義関数"
if OUT=$(node tools/static-check.js 2>&1); then
    ok "$OUT"
else
    ng "問題あり:"; echo "$OUT" | sed 's/^/        /'
fi

# --- 5b. 文字列の混入チェック ---
echo
echo "[5b] 想定外の文字（キリル文字など）の混入"
BAD=$(grep -rnP '[\x{0400}-\x{04FF}\x{AC00}-\x{D7AF}\x{0600}-\x{06FF}]' js/ server/ai/*.py index.html 2>/dev/null | head -5)
if [ -n "$BAD" ]; then
    ng "混入あり:"; echo "$BAD" | sed 's/^/        /'
else
    ok "混入なし"
fi

# --- 5c. iOS対応 ---
echo
echo "[5c] iOS（iPhone・iPad）対応"
if OUT=$(node tools/ios-check.js 2>&1); then
    ok "$(echo "$OUT" | tail -1 | sed 's/^ *//')"
else
    ng "問題あり:"; echo "$OUT" | grep "NG" | sed 's/^/        /'
fi

# --- 6. サーバー ---
echo
echo "[6] サーバーの稼働"
if curl -s -m 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    ok "Node ゲートウェイ (8080)"
else
    warn "Node ゲートウェイが停止しています"
fi
if curl -s -m 3 http://127.0.0.1:8765/health >/dev/null 2>&1; then
    ok "自作AIエンジン (8765)"
else
    warn "自作AIエンジンが停止しています（server/ai/start_ai.sh で起動）"
fi

# --- 7. 自作AIの自動テスト ---
echo
echo "[5d] ストッパー（この開発で実際に起きた失敗で止める）"
# 渡してはいけないものを、その場で止める。
# 見て報告するだけでは、壊れたものが渡ってしまうため。
# 作った人がいなくなっても、同じところで止まるようにしてある。
if OUT=$(node tools/ストッパー.js 2>&1); then
    ok "$(echo "$OUT" | grep -E '通りました|見ておく' | head -1 | sed 's/^ *//')"
else
    ng "止めるものがあります:"
    echo "$OUT" | sed -n '/渡してはいけません/,/^$/p' | head -12 | sed 's/^/    /'
fi
echo

echo "[6b] 覚えたことを保存できるか"
# macOS は隔離の印が付いたアプリを書き込めない場所で動かすことがある。
# そうなると学習は動いて見えるのに、保存のたびに黙って失敗し、
# 覚えたことが全部消える。実際に一度そうなっていた。
if W=$(curl -s -m 5 http://127.0.0.1:8765/writable 2>/dev/null) && [ -n "$W" ]; then
    if echo "$W" | grep -q '"書ける": true'; then
        ok "覚えたことを保存できます"
    else
        ng "保存できません（覚えたことが消えます）"
        echo "$W" | python3 -c "import json,sys;d=json.load(sys.stdin);print('        場所:',d['場所']);print('        直し方:',d['直し方'].replace(chr(10),'\n        '))" 2>/dev/null
    fi
else
    ng "自作AIに問い合わせられませんでした"
fi
echo

echo "[7] 自作AI 自動テスト"
if (cd server/ai && "$AI_PYTHON" test_ai.py > /tmp/areglm_test.log 2>&1); then
    ok "$(grep '結果:' /tmp/areglm_test.log | sed 's/^ *//')"
else
    ng "テストに失敗した項目があります"
    grep -A 20 '失敗した項目' /tmp/areglm_test.log | sed 's/^/        /'
fi

echo
# --- 8. アプリの起動口 ---
#
# 以前、同じアプリが複数の場所にあり、そのうち一つだけを直したせいで
# 「直したのに変わらない」が起きた。全部が同じ本体を呼んでいるかを見る。
echo
echo "[8] アプリ"
#
# アプリは1つだけ。ツール一式をその中に持っている。
#
# 置き場所が変わっても見つけられるよう、順に探す。
# 決め打ちにしていたところ、アプリを移した途端に
# 「アプリが見つかりません」と言うようになった。
#
# デスクトップには置かない。iCloud の同期対象になり、
# ファイルの実体が無くなって起動できなくなるため。
# 2026-08-20 に ~/Applications へ移した。
APP=""
for CAND in \
  "$HOME/Applications/AReGLM.app" \
  "/Applications/AReGLM.app" \
  "$HOME/Desktop/自作作業用ツール/AReGLM.app" ; do
    [ -d "$CAND" ] && { APP="$CAND"; break; }
done

# 見つからなければ、この検査自身の位置から遡って探す
if [ ! -d "$APP" ]; then
    # bash の変数名は英字にする。日本語の名前は Linux の bash では代入にならず、
    # 「/」に届かないまま回り続けて check.sh が終わらなかった。
    HERE="$(cd "$(dirname "$0")" && pwd)"
    while [ "$HERE" != "/" ]; do
        case "$HERE" in *.app) APP="$HERE"; break;; esac
        HERE="$(dirname "$HERE")"
    done
fi
if [ ! -d "$APP" ] && [ "$(uname)" != "Darwin" ]; then
    warn "Mac ではないので、アプリ（AReGLM.app）は見ていません"
elif [ ! -d "$APP" ]; then
    ng "アプリが見つかりません"
elif [ ! -x "$APP/Contents/MacOS/AReGLM" ]; then
    ng "アプリの起動口が実行できません"
elif [ ! -d "$APP/Contents/Resources/ツール本体" ]; then
    ng "アプリの中にツール本体がありません"
else
    ok "アプリ（中にツール一式を含む）: $APP"
    # 見張りは目印のフォルダの中のpidで確かめる（見張り.sh参照）。
    # ファイル名に日本語が入るため、プロセス一覧の文字列では探しにくい。
    WPID="$HOME/Library/Logs/AReGLM/見張り.lock/pid"
    if [ -f "$WPID" ] && kill -0 "$(cat "$WPID" 2>/dev/null)" 2>/dev/null; then
        ok "見張りが動いています（落ちても自分で立て直します）"
    else
        warn "見張りが止まっています（アプリを開くと始まります）"
    fi
fi

# --- 9. 戻り防止（一度できたことが、できなくなっていないか） ---
#
# 直したはずのことが、別の直しをきっかけに壊れる、
# ということが何度も起きた。人が毎回すべて試すのは無理なので
# ここで自動的に確かめる。
echo
echo "[9] 戻り防止"
if (cd server/ai && "$AI_PYTHON" 戻り防止.py > /tmp/areglm_regress.log 2>&1); then
    ok "$(grep -o '[0-9]*/[0-9]* 件が今も動いています' /tmp/areglm_regress.log | head -1)"
else
    ng "一度できていたことが、できなくなっています"
    sed -n 's/^  × /       できなくなった: /p;s/^      いま     : /         症状: /p' /tmp/areglm_regress.log | head -12
fi

# --- 10. 門番（悪いつもりの送り方で断られるか） ---
echo
echo "[10] 門番の自動テスト"
if curl -s -m 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    if OUT=$(node tools/門番の自動テスト.js 2>&1); then
        ok "$(echo "$OUT" | tail -1)"
    else
        ng "通ってはいけない送り方が通りました:"; echo "$OUT" | grep "✗" | sed 's/^/      /'
    fi
else
    warn "サーバーが止まっているので見ていません"
fi

# --- 11. 画面の主な流れ（ログイン・商品・やること・復元） ---
echo
echo "[11] 画面の自動テスト"
OUT=$(node tools/画面の自動テスト.js 2>&1); CODE=$?
if [ $CODE -eq 0 ]; then
    ok "$(echo "$OUT" | tail -1)"
elif [ $CODE -eq 2 ]; then
    warn "$(echo "$OUT" | tail -1 | sed 's/^－ *//')"
else
    ng "画面の流れで期待と違うところがあります:"; echo "$OUT" | grep "✗" | sed 's/^/      /'
fi

# --- 12. 同期のまとめ（id ごとの統合） ---
echo
echo "[12] 同期のまとめの自動テスト"
if OUT=$(node tools/同期のまとめの自動テスト.js 2>&1); then
    ok "$(echo "$OUT" | tail -1)"
else
    ng "同期のまとめで期待と違うところがあります:"; echo "$OUT" | grep "✗" | sed 's/^/      /'
fi

echo
echo "════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN} 問題は見つかりませんでした${NC}"
else
    echo -e "${RED} 問題が見つかりました。上の NG を確認してください${NC}"
fi


echo "════════════════════════════════════════"
exit $FAIL
