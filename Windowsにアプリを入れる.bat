@echo off
REM アプリがどこにも無い Windows 向け。GitHub から本物を入れてデスクトップに置く。
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if exist "%~dp0Windowsにアプリを入れる.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Windowsにアプリを入れる.ps1"
) else (
  echo この bat はツール本体の中で開いてください。
  echo まだ本体が無いときは、PowerShell で次を実行:
  echo   irm https://raw.githubusercontent.com/pentakobaryou0907-gif/ARELM/cursor/windows-app-shell-1936/Windows%%E3%%81%%AB%%E3%%82%%A2%%E3%%83%%97%%E3%%83%%AA%%E3%%82%%92%%E5%%85%%A5%%E3%%82%%8C%%E3%%82%%8B.ps1 ^| iex
  pause
)
endlocal
