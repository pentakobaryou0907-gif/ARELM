@echo off
REM AReGLM（Windows の入口）
REM
REM このファイルの名前は「AReGLM」です（拡張子を隠しているとそう見えます）。
REM ダブルクリックすると:
REM   1. デスクトップにアイコン付きのアプリ（AReGLM）を置く
REM   2. サーバーを起こしてログイン画面を開く
REM
REM このファイル自体はデスクトップへ移さないでください。
REM 隣の server フォルダを見失うためです。アプリは下の処理がデスクトップへ置きます。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing
if not exist "%~dp0server\index.js" goto missing

echo AReGLM をアプリとしてデスクトップに置き、アプリ画面を開きます…
echo （README.md は説明文です。開くのはこのファイルです）
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする
if errorlevel 1 goto fail_place

start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0見張り.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -ブラウザを開く
if errorlevel 1 goto fail_open

echo.
echo できました。
echo デスクトップの「AReGLM」（アイコン付き）がアプリです。次からはそちらを開いてください。
echo このウィンドウは閉じても構いません。
ping -n 4 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo ツールのフォルダの中から開いてください。
echo （見張り.ps1 と server フォルダが隣にある場所です）
echo.
pause
endlocal
exit /b 1

:fail_place
echo デスクトップにアプリを置けませんでした。
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo.
pause
endlocal
exit /b 1

:fail_open
echo.
echo アプリのアイコンは置きましたが、サーバーが応答しませんでした。
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo Node.js が無いときは https://nodejs.org/ の LTS を入れてから、
echo デスクトップの「AReGLM」をもう一度開いてください。
echo.
pause
endlocal
exit /b 1
