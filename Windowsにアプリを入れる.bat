@echo off
REM アプリがどこにも無い Windows 向け。GitHub（非公開）から本物を入れてデスクトップに置く。
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if exist "%~dp0Windowsにアプリを入れる.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Windowsにアプリを入れる.ps1"
) else if exist "%~dp0install-windows.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
) else (
  echo この bat はツール本体の中で開いてください。
  echo.
  echo リポジトリは非公開なので、irm は使えません。
  echo GitHub にログインして ZIP を落としてください:
  echo   https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/windows-app-shell-1936
  echo   緑の Code → Download ZIP
  echo   解凍した中身を OneDrive\デスクトップ\AReGLM\ツール本体 へ
  echo   その中の AReGLMをホーム画面に置く.bat を開く
  echo.
  echo Git がある場合の PowerShell:
  echo   git clone --branch cursor/windows-app-shell-1936 --single-branch https://github.com/pentakobaryou0907-gif/ARELM.git "%%USERPROFILE%%\OneDrive\デスクトップ\AReGLM\ツール本体"
  pause
)
endlocal
