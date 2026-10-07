# AReGLM をこの Windows に入れる（本物のツール本体）
#
# いま開いている「AIツール開発プロジェクト\README.md」はメモ用です。
# 中身は空に近く、アプリのコードは入っていません。
# このスクリプトは GitHub から本物を「AReGLM\ツール本体」へ入れ、
# デスクトップにアイコンを置きます。
#
# PowerShell で実行:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   irm https://raw.githubusercontent.com/pentakobaryou0907-gif/ARELM/cursor/windows-app-shell-1936/Windows%E3%81%AB%E3%82%A2%E3%83%97%E3%83%AA%E3%82%92%E5%85%A5%E3%82%8C%E3%82%8B.ps1 | iex

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'https://github.com/pentakobaryou0907-gif/ARELM.git'
$Branch = 'cursor/windows-app-shell-1936'

function Write-Step([string]$msg) {
    Write-Host ''
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

# ユーザーが見ている OneDrive\デスクトップ\AReGLM の下に「ツール本体」を作る
function Get-AreglmHome {
    foreach ($候補 in @(
        (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ\AReGLM'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop\AReGLM'),
        (Join-Path $env:USERPROFILE 'Desktop\AReGLM'),
        (Join-Path $env:USERPROFILE 'デスクトップ\AReGLM')
    )) {
        if ($候補 -and (Test-Path -LiteralPath $候補)) { return $候補 }
    }
    # フォルダが無ければ OneDrive デスクトップ優先で作る
    foreach ($親 in @(
        (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        [Environment]::GetFolderPath('Desktop')
    )) {
        if ($親 -and (Test-Path -LiteralPath $親)) {
            $家 = Join-Path $親 'AReGLM'
            New-Item -ItemType Directory -Force -Path $家 | Out-Null
            return $家
        }
    }
    $家 = Join-Path $env:USERPROFILE 'AReGLM'
    New-Item -ItemType Directory -Force -Path $家 | Out-Null
    return $家
}

try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue } catch { }

Write-Step '前置の確認'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $文 = "Git が入っていません。`r`nhttps://git-scm.com/download/win から入れてから、もう一度実行してください。"
    Write-Host $文 -ForegroundColor Red
    try { [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null } catch { }
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js がまだありません。あとで https://nodejs.org の LTS を入れてください。' -ForegroundColor Yellow
}

$HomeDir = Get-AreglmHome
$Dest = Join-Path $HomeDir 'ツール本体'
Write-Step "本物のツールをここに入れます → $Dest"
Write-Host '（「AIツール開発プロジェクト」はメモのまま残します。触りません）'

if (Test-Path -LiteralPath (Join-Path $Dest '.git')) {
    Push-Location $Dest
    git fetch origin $Branch
    git checkout $Branch
    git pull origin $Branch
    Pop-Location
} elseif (Test-Path -LiteralPath $Dest) {
    # 中身が違うフォルダなら、使用済みへ移してから入れ直す（消さない）
    $使用済み = Join-Path $HomeDir '使用済み'
    New-Item -ItemType Directory -Force -Path $使用済み | Out-Null
    $退避 = Join-Path $使用済み ("ツール本体_旧_" + (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
    Move-Item -LiteralPath $Dest -Destination $退避 -Force
    git clone --branch $Branch --single-branch $Repo $Dest
} else {
    git clone --branch $Branch --single-branch $Repo $Dest
}

$ps1 = Join-Path $Dest '見張り.ps1'
if (-not (Test-Path -LiteralPath $ps1)) {
    $文 = "入れに失敗しました。見張り.ps1 がありません。`r`n$Dest"
    Write-Host $文 -ForegroundColor Red
    try { [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null } catch { }
    exit 1
}

# メモ用フォルダの隣に案内を置く（README を書き換えない）
$案内 = Join-Path $HomeDir 'ここがアプリです_ツール本体を開いてください.txt'
@"
AReGLM のアプリ本体は、隣のフォルダ「ツール本体」です。

× AIツール開発プロジェクト\README.md  … メモ用（中身はほぼ空）
○ ツール本体\                        … 本物（見張り.ps1・server などがある）

デスクトップの「AReGLM」アイコンから開くか、
「ツール本体」の中の「AReGLMをホーム画面に置く.bat」を開いてください。
"@ | Set-Content -LiteralPath $案内 -Encoding UTF8

Write-Step 'サーバーの部品（初回）'
$server = Join-Path $Dest 'server'
if ((Get-Command npm -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath (Join-Path $server 'node_modules\express\package.json'))) {
    Push-Location $server
    npm install
    Pop-Location
}

Write-Step 'デスクトップに AReGLM アイコンを置く'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 -アプリにする -静かに

$置いた = @()
foreach ($d in @(
    (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Desktop')
)) {
    $lnk = Join-Path $d 'AReGLM.lnk'
    if ($d -and (Test-Path -LiteralPath $lnk)) { $置いた += $lnk }
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host ' できました'
Write-Host " 本物の場所: $Dest"
Write-Host ' エクスプローラーで「ツール本体」を開きます'
Write-Host ' （AIツール開発プロジェクト ではありません）'
if ($置いた.Count -gt 0) {
    Write-Host ' デスクトップの AReGLM アイコンからも開けます'
}
Write-Host '========================================' -ForegroundColor Green

# 本物のフォルダを開いて見せる（メモの README ではなく）
explorer.exe $Dest
if ($置いた.Count -gt 0) {
    Start-Sleep -Seconds 1
    explorer.exe /select,$($置いた[0])
}
