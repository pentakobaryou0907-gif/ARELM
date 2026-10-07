@echo off
REM ARELM ランチャー（デスクトップPC / Windows）
REM
REM 「AReGLM」と書いてあるこのファイル（または AReGLM.bat）をダブルクリックすると:
REM   1. デスクトップにアイコン付きのアプリ（AReGLM）を置く
REM   2. サーバーと自作AIが止まっていれば起動する
REM   3. ログイン画面を開く
REM
REM このファイル自体はデスクトップへ移さないでください。
REM アプリはデスクトップへ自動で置かれます。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing
if not exist "%~dp0server\index.js" goto missing

echo AReGLM をアプリとしてデスクトップに置き、開きます…
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする
if errorlevel 1 (
    echo アプリの配置で問題がありました。続けて起動を試みます…
)

start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0見張り.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -ブラウザを開く
if errorlevel 1 goto fail

echo.
echo ログイン画面を開きました。
echo デスクトップの「AReGLM」（アイコン付き）がアプリです。次からはそちらを開いてください。
echo このウィンドウは閉じても構いません。
ping -n 3 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo ツールのフォルダの中から開いてください。
echo.
pause
endlocal
exit /b 1

:fail
echo.
echo サーバーが応答しなかったため、画面を開けませんでした。
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo Node.js が入っていないときは、入れてからデスクトップの「AReGLM」を開いてください。
echo https://nodejs.org/
echo.
pause
endlocal
exit /b 1
