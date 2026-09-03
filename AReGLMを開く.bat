@echo off
REM AReGLM ランチャー（Windows版）
REM
REM ダブルクリックすると:
REM   1. サーバーと自作AIが止まっていれば起動する（見張り.ps1）
REM   2. Chromeで開く（無ければ既定のブラウザで開く）
REM
REM 実機のWindowsでは検証できていない。うまく動かないときは、
REM このファイルではなく 見張り.ps1 の中身を見直してほしい。

setlocal
set TOOL=%~dp0

REM 見張りを（動いていなければ）裏で起動する
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%TOOL%見張り.ps1"

REM 立ち上がるまで少し待つ
timeout /t 3 /nobreak >nul

set URL=http://127.0.0.1:8090

where chrome >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" chrome "%URL%"
) else (
    start "" "%URL%"
)

endlocal
