@echo off
REM デスクトップ（ホーム画面）に AReGLM のアイコンだけを置く
REM
REM サーバーはまだ起動しません。
REM 置いたアイコンをあとから開くと、ログイン画面まで進みます。
REM このファイル自体はデスクトップへ移さないでください。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing

echo デスクトップに AReGLM アプリ（アイコン付き）を置きます…
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする
if errorlevel 1 goto fail

echo.
echo できました。デスクトップの「AReGLM」がアプリです。それを開いてください。
echo このウィンドウは閉じても構いません。
ping -n 4 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo ツールのフォルダの中から開いてください。
echo.
pause
endlocal
exit /b 1

:fail
echo アイコンを置けませんでした。
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo.
pause
endlocal
exit /b 1
