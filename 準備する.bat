@echo off
REM AReGLM を動かすのに要るものを揃えて、デスクトップに AReGLM を置く
REM 中身は 準備.ps1。このファイルはツールのフォルダの中から開いてください。

chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0準備.ps1" (
    echo ツールのフォルダの中から開いてください。
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0準備.ps1"
