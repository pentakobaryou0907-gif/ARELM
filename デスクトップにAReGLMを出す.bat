@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo   デスクトップに AReGLM アプリを出します…
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0デスクトップにAReGLMを出す.ps1"
if errorlevel 1 (
  echo.
  echo   失敗しました。Git が入っているか、GitHub にログインできるか確かめてください。
  echo   手順: 三端末に置く.txt
  pause
  exit /b 1
)
echo.
pause
endlocal
