# AReGLM をこの Windows のホーム画面（デスクトップ）に置く
#
# いま開いている「AIツール開発プロジェクト\README.md」のフォルダは、
# チャット整理用のメモ置き場です。アプリ本体ではありません。
# このスクリプトは、GitHub から本物のツールを入れ、デスクトップに
# Mac の AReGLM.app と同じ役割のアイコンを置きます。
#
# 使い方（PowerShell）:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   irm https://raw.githubusercontent.com/pentakobaryou0907-gif/ARELM/cursor/windows-app-shell-1936/Windows%E3%81%AB%E3%82%A2%E3%83%97%E3%83%AA%E3%82%92%E5%85%A5%E3%82%8C%E3%82%8B.ps1 | iex
#
# または、このファイルを保存して:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\Windowsにアプリを入れる.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'https://github.com/pentakobaryou0907-gif/ARELM.git'
$Branch = 'cursor/windows-app-shell-1936'
# OneDrive のデスクトップ下（AIツール開発プロジェクト）には置かない。
# クラウド同期の途中で入口が欠けて、アプリが消えたように見えるため。
$Dest = Join-Path $env:USERPROFILE 'AReGLM'

function Write-Step([string]$msg) {
    Write-Host ''
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
} catch { }

Write-Step '前置の確認'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $文 = "Git が入っていません。`r`nhttps://git-scm.com/ から入れてから、もう一度この手順を実行してください。"
    Write-Host $文 -ForegroundColor Red
    try { [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null } catch { }
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js がまだありません。あとで https://nodejs.org の LTS を入れてください（サーバー起動に必要）。' -ForegroundColor Yellow
}

Write-Step "ツール本体を入れます → $Dest"
if (Test-Path -LiteralPath (Join-Path $Dest '.git')) {
    Push-Location $Dest
    git fetch origin $Branch
    git checkout $Branch
    git pull origin $Branch
    Pop-Location
} elseif (Test-Path -LiteralPath $Dest) {
    $文 = "$Dest は既にありますが、Git のリポジトリではありません。`r`n名前を変えるか移してから、もう一度実行してください。"
    Write-Host $文 -ForegroundColor Red
    try { [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null } catch { }
    exit 1
} else {
    git clone --branch $Branch --single-branch $Repo $Dest
}

$ps1 = Join-Path $Dest '見張り.ps1'
$bat = Join-Path $Dest 'AReGLMをホーム画面に置く.bat'
if (-not (Test-Path -LiteralPath $ps1)) {
    $文 = "本物のツールが入っていません（見張り.ps1 が無い）。`r`n$Dest"
    Write-Host $文 -ForegroundColor Red
    try { [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null } catch { }
    exit 1
}

Write-Step 'サーバーの部品（初回だけ）'
$server = Join-Path $Dest 'server'
if ((Get-Command npm -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath (Join-Path $server 'node_modules\express\package.json'))) {
    Push-Location $server
    npm install
    Pop-Location
}

Write-Step 'デスクトップ（ホーム画面）に AReGLM アイコンを置く（確認ウィンドウなし）'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 -アプリにする -静かに
if ($LASTEXITCODE -ne 0) {
    $auto = Join-Path $Dest '自動でホーム画面に置く.bat'
    if (Test-Path -LiteralPath $auto) {
        Write-Host '自動配置 bat から再試行します…'
        & cmd.exe /c "`"$auto`""
    } elseif (Test-Path -LiteralPath $bat) {
        Write-Host 'bat から再試行します…'
        & cmd.exe /c "`"$bat`""
    }
}

$文 = @"
できました。

・ツール本体: $Dest
・デスクトップの「AReGLM」がアプリです（Mac のホーム画面と同じ役割）

次はデスクトップの AReGLM をダブルクリックしてください。
（今開いている「AIツール開発プロジェクト\README.md」はメモ用で、アプリではありません）
"@
Write-Host $文
try { [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM — ホーム画面に置きました', 'OK', 'Information') | Out-Null } catch { }
explorer.exe $Dest
