@echo off
REM ============================================================
REM  Mac のホーム画面にある AReGLM.app と同じ役割を、Windows に置く
REM ============================================================
REM
REM README.md は説明文です。このファイルが「ホーム画面にアプリを置く」入口です。
REM
REM やること:
REM   1. デスクトップ（ホーム画面）に、アイコン付きの「AReGLM」を置く
REM   2. スタートメニューにも置く
REM   3. サインインしたら見張りが裏で動くようにする（可能なとき）
REM
REM サーバーはまだ起動しません。置いた「AReGLM」をあとから開いてください。
REM このファイル自体はデスクトップへ移さないでください。

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "%~dp0見張り.ps1" goto missing
if not exist "%~dp0server\index.js" goto missing
if not exist "%~dp0images\areglm.ico" (
    echo アイコン images\areglm.ico がありません。同期が終わっているか確かめてください。
    echo.
)

echo.
echo   Mac のホーム画面の AReGLM と同じように、
echo   この Windows のデスクトップへ AReGLM アプリを置きます…
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする
if errorlevel 1 goto fail

echo.
echo   -----------------------------------------------
echo   できました。
echo.
echo   デスクトップ（ホーム画面）の「AReGLM」がアプリです。
echo   次からはそれをダブルクリックするだけで開けます。
echo.
echo   README.md は説明文のままです（アプリではありません）。
echo   -----------------------------------------------
echo.
ping -n 6 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo.
echo   ツールのフォルダの中から開いてください。
echo   （見張り.ps1 と server フォルダが隣にある場所です）
echo   README.md だけのフォルダではアプリを作れません。
echo.
pause
endlocal
exit /b 1

:fail
echo.
echo   デスクトップに置けませんでした。
echo   ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
echo.
pause
endlocal
exit /b 1
