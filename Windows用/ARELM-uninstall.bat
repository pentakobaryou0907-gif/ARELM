@echo off
rem ARELM のアイコンと、この PC に置いた起動用ファイルを取り除きます。
rem Mac 側のデータは、何も消えません。
setlocal
del "%USERPROFILE%\Desktop\ARELM.lnk" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ARELM.lnk'); Remove-Item -ErrorAction SilentlyContinue (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ARELM.lnk')"
rem 窓の記録（ログイン状態など）は残したまま、起動用ファイルだけ取り除く
del "%LocalAppData%\ARELM\ARELM-open.bat" 2>nul
del "%LocalAppData%\ARELM\ARELM-target.txt" 2>nul
del "%LocalAppData%\ARELM\ARELM.ico" 2>nul
echo.
echo  取り除きました。
pause
exit /b 0
