@echo off
rem ARELM のアイコンと、この PC に置いた起動用ファイルを取り除きます。
rem Mac 側のデータは、何も消えません。
setlocal

rem 消したことを、ARELM（Mac）へ知らせる（設定の「3台の端末」の表示を正しくするため）
if exist "%LocalAppData%\ARELM\ARELM-report.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%LocalAppData%\ARELM\ARELM-report.ps1" -Removed

rem 今の名前（ARELM）と、前の名前（ARELM（アレラム））の両方のアイコンを、デスクトップとスタートメニューから取り除く
powershell -NoProfile -ExecutionPolicy Bypass -Command "foreach($n in @('ARELM.lnk','ARELM（アレラム）.lnk','AReGLM.lnk')){ Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) $n); Remove-Item -ErrorAction SilentlyContinue (Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $n)) }"

rem 起動用ファイルだけ取り除く
del "%LocalAppData%\ARELM\ARELM-open.bat" 2>nul
del "%LocalAppData%\ARELM\ARELM-target.txt" 2>nul
del "%LocalAppData%\ARELM\ARELM.ico" 2>nul
del "%LocalAppData%\ARELM\ARELM-report.ps1" 2>nul
del "%LocalAppData%\ARELM\ARELM-report.txt" 2>nul

echo.
echo  取り除きました。もう一度入れるときは、ARELM-install.bat を実行してください。
echo.
pause
