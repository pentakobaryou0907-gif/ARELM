@echo off
rem ARELM を、この Windows PC に「アプリ」として入れます。
rem   ・デスクトップとスタートメニューに「ARELM（アレラム）」のアイコンを作る
rem   ・ダブルクリックすると、専用の窓で ARELM が開く
rem 何度実行しても大丈夫です（上書きするだけです）。消したいときは、ARELM-uninstall.bat を実行してください。
setlocal
set "HERE=%~dp0"
set "DEST=%LocalAppData%\ARELM"

if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%HERE%ARELM-open.bat" "%DEST%\" >nul
copy /Y "%HERE%ARELM-target.txt" "%DEST%\" >nul
copy /Y "%HERE%ARELM.ico" "%DEST%\" >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; foreach($o in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ARELM.lnk'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ARELM.lnk'))){ Remove-Item -ErrorAction SilentlyContinue $o }; $d=Join-Path $env:LOCALAPPDATA 'ARELM'; foreach($p in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))){ $s=$w.CreateShortcut((Join-Path $p 'ARELM（アレラム）.lnk')); $s.TargetPath=(Join-Path $d 'ARELM-open.bat'); $s.WorkingDirectory=$d; $s.IconLocation=(Join-Path $d 'ARELM.ico'); $s.WindowStyle=7; $s.Description='ARELM（アレラム）'; $s.Save() }"

if errorlevel 1 (
  echo.
  echo  アイコンを作れませんでした。
  echo  代わりに、LocalAppData の ARELM フォルダにある ARELM-open.bat をダブルクリックしても開けます。
  pause
  exit /b 1
)

echo.
echo  入れました。デスクトップの「ARELM（アレラム）」をダブルクリックしてください。
echo  はじめて開くときは、Mac で決めた「合言葉」を聞かれます。
echo.
pause
exit /b 0
