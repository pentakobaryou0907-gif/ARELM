@echo off
REM ============================================================
REM  Windows 到着後に、ホーム画面（デスクトップ）へ AReGLM を置く
REM  （確認ウィンドウを出さず、ユーザー操作ゼロで動かす想定）
REM ============================================================
REM
REM Syncthing 等でこのファイルが Windows 側のツールフォルダに届いたあと、
REM スタートアップから一度呼べば、デスクトップに AReGLM アイコンが付きます。
REM
REM スタートアップ登録そのものは Windows 上でしかできないため、
REM 隣の「Windowsスタートアップへの入れ方.txt」を見てください。
REM
REM このファイル自体はデスクトップへ移さないでください（server を見失います）。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing
if not exist "%~dp0server\index.js" goto missing

REM コンソールを出さず、見張りにデスクトップ配置だけさせる
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする -静かに
endlocal
exit /b %ERRORLEVEL%

:missing
REM ツール本体がまだ揃っていない（同期途中など）。スタートアップから再試行される想定。
endlocal
exit /b 1
