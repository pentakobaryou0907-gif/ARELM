@echo off
REM ARELM ランチャー（デスクトップPC / Windows）
REM
REM ツールのフォルダの中でダブルクリックすると:
REM   1. サーバーと自作AIが止まっていれば起動する（見張り.ps1）
REM   2. 応答するまで待ってから、ブラウザで開く
REM
REM デスクトップに出したいときは、このファイル自体は移さず、
REM ショートカットを作ってください。ファイルだけ移すと、
REM 隣にあるサーバーを見つけられなくなります。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing
if not exist "%~dp0server\index.js" goto missing

echo AReGLM を起動します…
echo.

REM 見張りは裏で動き続ける。画面を開く処理は、同じファイルの別の入口。
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0見張り.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -ブラウザを開く
if errorlevel 1 goto fail

echo.
echo ブラウザで開きました。このウィンドウは閉じても構いません。
ping -n 3 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo ツールのフォルダの中から開いてください。
echo デスクトップに出したいときは、ショートカットを作ってください。
echo.
pause
endlocal
exit /b 1

:fail
echo.
echo サーバーが応答しなかったため、画面を開けませんでした。
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo Node.js が入っていないときは、入れてからもう一度開いてください。
echo https://nodejs.org/
echo.
pause
endlocal
exit /b 1
