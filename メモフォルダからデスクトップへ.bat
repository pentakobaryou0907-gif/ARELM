@echo off
REM ============================================================
REM  この bat を「AIツール開発プロジェクト」の中に置いてダブルクリックしてもよい
REM  （メモの README の隣）。本物をツール本体へ入れ、デスクトップに AReGLM を出す。
REM ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM すでにツール本体の中なら、そのまま出す
if exist "%~dp0見張り.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0デスクトップにAReGLMを出す.ps1"
  goto end
)

REM 隣の「ツール本体」を探す（OneDrive\デスクトップ\AReGLM\ 配下）
set "親=%~dp0.."
for %%I in ("%親%") do set "親=%%~fI"
set "本体=%親%\ツール本体"

if exist "%本体%\デスクトップにAReGLMを出す.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%本体%\デスクトップにAReGLMを出す.ps1"
  goto end
)
if exist "%本体%\見張り.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%本体%\見張り.ps1" -アプリにする -静かに
  explorer.exe /select,"%USERPROFILE%\OneDrive\デスクトップ\AReGLM.lnk"
  goto end
)

REM まだ無い → Git で入れる
echo ツール本体が無いので GitHub から入れます…
echo 先に Git が必要です。
where git >nul 2>nul
if errorlevel 1 (
  echo Git がありません。https://git-scm.com/download/win
  start https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/three-devices-home-1936
  pause
  exit /b 1
)
if not exist "%親%" mkdir "%親%"
if exist "%本体%\.git" (
  pushd "%本体%"
  git fetch origin cursor/three-devices-home-1936
  git checkout cursor/three-devices-home-1936
  git pull origin cursor/three-devices-home-1936
  popd
) else (
  if exist "%本体%" (
    if not exist "%親%\使用済み" mkdir "%親%\使用済み"
    move "%本体%" "%親%\使用済み\ツール本体_旧_%DATE:/=-%_%RANDOM%"
  )
  git clone --branch cursor/three-devices-home-1936 --single-branch https://github.com/pentakobaryou0907-gif/ARELM.git "%本体%"
)

if exist "%本体%\デスクトップにAReGLMを出す.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%本体%\デスクトップにAReGLMを出す.ps1"
) else if exist "%本体%\見張り.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%本体%\見張り.ps1" -アプリにする -静かに
) else (
  echo 入れに失敗しました。
  start https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/three-devices-home-1936
  pause
  exit /b 1
)

:end
echo.
echo デスクトップの「AReGLM」がアプリです。README.md はメモのままです。
ping -n 5 127.0.0.1 >nul
endlocal
