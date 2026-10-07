@echo off
REM デスクトップ（ホーム画面）に AReGLM のアイコンだけを置く
REM （中身は AReGLMをホーム画面に置く.bat と同じ。どちらを開いてもよい）

chcp 65001 >nul
setlocal
cd /d "%~dp0"

if exist "%~dp0AReGLMをホーム画面に置く.bat" (
    call "%~dp0AReGLMをホーム画面に置く.bat"
    exit /b %ERRORLEVEL%
)

if not exist "%~dp0見張り.ps1" goto missing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0見張り.ps1" -アプリにする
if errorlevel 1 goto fail
echo できました。デスクトップの「AReGLM」を開いてください。
ping -n 4 127.0.0.1 >nul
endlocal
exit /b 0

:missing
echo ツールのフォルダの中から開いてください。
pause
endlocal
exit /b 1

:fail
echo ログ: %LOCALAPPDATA%\AReGLM\logs\見張り.log
pause
endlocal
exit /b 1
