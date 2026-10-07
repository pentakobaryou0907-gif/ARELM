#!/bin/bash
# Mac の self-hosted worker 上で実行する想定。
# 本体を最新ブランチにし、ホーム画面へ AReGLM.app を置き、
# Syncthing 共有の現状を報告する（設定は勝手に変えない）。
#
# 使い方: bash tools/mac-deliver-to-windows.sh

set -u
REPORT="${TMPDIR:-/tmp}/areglm-mac-deliver-report.txt"
: > "$REPORT"
log() { echo "$*" | tee -a "$REPORT"; }

log "=== AReGLM Mac→Windows 届け準備 $(date) ==="
log "HOST=$(hostname) USER=$(whoami) HOME=$HOME"

CANDIDATES=(
  "$HOME/Applications/AReGLM.app/Contents/Resources/ツール本体"
  "$HOME/Developer/AReGLM"
  "$HOME/Desktop/AReGLM"
  "$HOME/Documents/AReGLM"
  "$HOME/AReGLM"
)

# Syncthing っぽいフォルダも候補に足す（中身はあとで判定）
while IFS= read -r d; do
  [ -n "$d" ] && CANDIDATES+=("$d")
done < <(find "$HOME" -maxdepth 4 -type d \( -name 'AReGLM' -o -name 'ARELM' \) 2>/dev/null | head -40)

TOOL=""
for c in "${CANDIDATES[@]}"; do
  if [ -f "$c/見張り.sh" ] && [ -f "$c/server/index.js" ]; then
    TOOL="$c"
    break
  fi
done

BRANCH="cursor/windows-app-shell-1936"
REPO="https://github.com/pentakobaryou0907-gif/ARELM.git"

if [ -z "$TOOL" ]; then
  log "本体なし → $HOME/Developer/AReGLM へ clone"
  mkdir -p "$HOME/Developer"
  git clone --branch "$BRANCH" --single-branch "$REPO" "$HOME/Developer/AReGLM"
  TOOL="$HOME/Developer/AReGLM"
else
  log "本体発見: $TOOL"
  if [ -d "$TOOL/.git" ]; then
    (
      cd "$TOOL" || exit 1
      git fetch origin "$BRANCH"
      git checkout "$BRANCH"
      git pull --ff-only origin "$BRANCH" || git pull origin "$BRANCH"
    ) | tee -a "$REPORT"
  else
    log "注意: .git が無いので fetch/checkout はスキップ"
  fi
fi

log "本体の絶対パス: $TOOL"
log "見張り.sh: $([ -f "$TOOL/見張り.sh" ] && echo OK || echo NG)"
log "server/index.js: $([ -f "$TOOL/server/index.js" ] && echo OK || echo NG)"

if [ -f "$TOOL/ホーム画面に置く.command" ]; then
  log "Mac ホーム画面配置を実行…"
  bash "$TOOL/ホーム画面に置く.command" | tee -a "$REPORT"
else
  log "ホーム画面に置く.command が無い"
fi

for p in "$HOME/Desktop/AReGLM.app" "$HOME/デスクトップ/AReGLM.app" "$HOME/Applications/AReGLM.app"; do
  if [ -d "$p" ]; then
    log "AReGLM.app あり: $p"
  fi
done

log "--- Syncthing ---"
if command -v syncthing >/dev/null 2>&1; then
  log "syncthing CLI: $(command -v syncthing)"
  syncthing --version 2>&1 | head -3 | tee -a "$REPORT" || true
else
  log "syncthing CLI: 無し"
fi
if [ -d "/Applications/Syncthing.app" ]; then
  log "Syncthing.app: あり"
else
  log "Syncthing.app: 無し"
fi

CFG="$HOME/Library/Application Support/Syncthing/config.xml"
if [ -f "$CFG" ]; then
  log "config.xml: $CFG"
  # フォルダ path / label だけ抜き出す（設定変更はしない）
  python3 - "$CFG" <<'PY' | tee -a "$REPORT"
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
for folder in root.findall('folder'):
    print(f"  id={folder.get('id')} label={folder.get('label')} path={folder.get('path')} type={folder.get('type')}")
PY
else
  log "Syncthing config.xml: 見つからない（未導入か別ユーザー）"
fi

# .stfolder がある場所 = 実際に同期中のフォルダ
log "--- .stfolder 探索（深さ5） ---"
while IFS= read -r st; do
  parent="$(dirname "$st")"
  log "同期フォルダ候補: $parent"
  for f in "AReGLMをホーム画面に置く.bat" "Windowsにアプリを入れる.ps1" "見張り.ps1" "アプリ枠.html" "自動でホーム画面に置く.bat"; do
    if [ -f "$parent/$f" ]; then
      log "  OK $f"
    else
      log "  NG $f"
    fi
  done
done < <(find "$HOME" -maxdepth 5 -type d -name '.stfolder' 2>/dev/null | head -20)

if [ -n "$TOOL" ] && [ ! -d "$TOOL/.stfolder" ]; then
  log "注意: 本体 ($TOOL) 自体には .stfolder が無い（Syncthing 直下ではない可能性）"
  log "共有フォルダが別なら、設定変更はせず現状報告のみ。必要なら本体を共有側へ手動コピー。"
fi

# Windows 向けファイルが本体にあるか
log "--- 本体の Windows 向けファイル ---"
for f in "AReGLMをホーム画面に置く.bat" "Windowsにアプリを入れる.ps1" "見張り.ps1" "アプリ枠.html" "自動でホーム画面に置く.bat" "Windowsスタートアップへの入れ方.txt"; do
  if [ -f "$TOOL/$f" ]; then
    log "OK $f"
  else
    log "NG $f"
  fi
done

log "=== 報告ファイル: $REPORT ==="
cat "$REPORT"
