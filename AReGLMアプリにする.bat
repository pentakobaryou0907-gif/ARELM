@echo off
REM 「AReGLM」と書いてあるファイル／このファイルから、デスクトップ用のアプリを作る
REM
REM やること:
REM   ・デスクトップとスタートメニューに、アイコン付きの「AReGLM」を置く
REM   ・デスクトップに誤って置いた .bat などは消さず「使用済み」へ移す
REM   ・サーバーはまだ起動しない（あとからデスクトップのアイコンで開く）
REM
REM このファイル自体はデスクトップへ移さないでください。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing

echo デスクトップに AReGLM アプリを作ります…
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする
if errorlevel 1 goto fail

echo.
echo できました。デスクトップの「AReGLM」がアプリです。
echo 次はそれをダブルクリックしてログインしてください。
echo このウィンドウは閉じても構いません。
ping -n 5 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo ツールのフォルダの中から開いてください。
echo.
pause
endlocal
exit /b 1

:fail
echo アプリを作れませんでした。
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo.
pause
endlocal
exit /b 1
