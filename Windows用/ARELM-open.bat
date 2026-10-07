@echo off
rem ARELM を開く（Windows用の起動口）
rem
rem Mac で動いている ARELM を、専用の窓（アドレス欄なし）で開きます。
rem 接続先は ARELM-target.txt に1行ずつ書いてあり、上から順に試して、
rem 最初に届いたものを使います（Macのアドレスが変わっても動くように、名前と番号の両方を書いてあります）。
setlocal
set "HERE=%~dp0"
set "HOST="

for /f "usebackq delims=" %%H in ("%HERE%ARELM-target.txt") do call :try "%%H"

if not defined HOST (
  echo.
  echo  ARELM に届きませんでした。次を確かめてください。
  echo    1. Mac の電源が入っていて、ARELM が起動している
  echo    2. この PC と Mac が、同じ Wi-Fi / 同じネットワークにいる
  echo    3. Mac の「他の端末から使う」がオンになっている
  echo.
  pause
  exit /b 1
)

rem 窓だけで開けるブラウザを探す（Chrome があれば Chrome、無ければ Edge）
set "BR="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BR=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BR=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BR if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BR=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BR (
  rem 窓専用で開けるブラウザが見つからないときは、いつものブラウザで開く
  start "" "http://%HOST%/"
  exit /b 0
)

start "" "%BR%" --app="http://%HOST%/" --user-data-dir="%LocalAppData%\ARELM\window" --no-first-run --no-default-browser-check --window-size=1280,860
exit /b 0

:try
if defined HOST exit /b 0
curl.exe -s -m 3 -o NUL "http://%~1/"
if not errorlevel 1 set "HOST=%~1"
exit /b 0
