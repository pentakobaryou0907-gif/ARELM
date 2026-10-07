# AReGLM をこの Windows に入れる（本物のツール本体）
#
# ※ このリポジトリは非公開です。
#   ログインなしの「irm … | iex」は 404 になり動きません。
#   GitHub にログインした状態で、下のどちらかを使ってください。
#
# 【いちばん簡単】ブラウザで ZIP を落とす
#   1) https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/three-devices-home-1936
#   2) 緑の Code → Download ZIP
#   3) 解凍した中身を OneDrive\デスクトップ\AReGLM\ツール本体 へ入れる
#   4) ツール本体\AReGLMをホーム画面に置く.bat を開く
#
# 【Git があるとき】PowerShell でこのファイルを実行、または:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   git clone --branch cursor/three-devices-home-1936 --single-branch https://github.com/pentakobaryou0907-gif/ARELM.git "$env:USERPROFILE\OneDrive\デスクトップ\AReGLM\ツール本体"

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'https://github.com/pentakobaryou0907-gif/ARELM.git'
$Branch = 'cursor/three-devices-home-1936'
$ZipPage = "https://github.com/pentakobaryou0907-gif/ARELM/archive/refs/heads/$Branch.zip"
$BranchPage = "https://github.com/pentakobaryou0907-gif/ARELM/tree/$Branch"

function Write-Step([string]$msg) {
    Write-Host ''
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Get-AreglmHome {
    foreach ($候補 in @(
        (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ\AReGLM'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop\AReGLM'),
        (Join-Path $env:USERPROFILE 'Desktop\AReGLM'),
        (Join-Path $env:USERPROFILE 'デスクトップ\AReGLM')
    )) {
        if ($候補 -and (Test-Path -LiteralPath $候補)) { return $候補 }
    }
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

function Show-ZipGuide([string]$Dest) {
    $文 = @"
このリポジトリは非公開のため、ネットからの自動取得に失敗しました。

GitHub にログインしたブラウザで ZIP を落としてください。

1) $BranchPage
2) 緑の「Code」→「Download ZIP」
3) 解凍したフォルダの中身を、次へコピー:
   $Dest
4) その中の「AReGLMをホーム画面に置く.bat」を開く

いま開いている「AIツール開発プロジェクト\README.md」はメモ用です。触らなくて大丈夫です。
"@
    Write-Host $文 -ForegroundColor Yellow
    try {
        Start-Process $BranchPage
        Start-Process $ZipPage
    } catch { }
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM — GitHub から入れる', 'OK', 'Information') | Out-Null
    } catch { }
}

function Install-FromZip([string]$Dest, [string]$HomeDir) {
    Write-Step 'ZIP で入れます（GitHub ログインが必要）'
    $tmp = Join-Path $env:TEMP ("areglm-zip-" + [guid]::NewGuid().ToString('N'))
    $zip = Join-Path $env:TEMP ("areglm-" + $Branch.Replace('/', '-') + ".zip")
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        # ブラウザと同じセッションは使えない。gh か、手動 ZIP に任せる。
        if (Get-Command gh -ErrorAction SilentlyContinue) {
            Write-Host 'gh で ZIP を取得します…'
            & gh api "repos/pentakobaryou0907-gif/ARELM/zipball/$Branch" -H 'Accept: application/vnd.github+json' --output $zip
        } else {
            return $false
        }
        if (-not (Test-Path -LiteralPath $zip) -or ((Get-Item -LiteralPath $zip).Length -lt 1000)) {
            return $false
        }
        Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
        $中身 = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
        if (-not $中身) { return $false }
        if (Test-Path -LiteralPath $Dest) {
            $使用済み = Join-Path $HomeDir '使用済み'
            New-Item -ItemType Directory -Force -Path $使用済み | Out-Null
            $退避 = Join-Path $使用済み ("ツール本体_旧_" + (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
            Move-Item -LiteralPath $Dest -Destination $退避 -Force
        }
        New-Item -ItemType Directory -Force -Path $Dest | Out-Null
        Copy-Item -Path (Join-Path $中身.FullName '*') -Destination $Dest -Recurse -Force
        return (Test-Path -LiteralPath (Join-Path $Dest '見張り.ps1'))
    } catch {
        Write-Host ("ZIP 取得に失敗: " + $_.Exception.Message) -ForegroundColor Yellow
        return $false
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    }
}

try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue } catch { }

$HomeDir = Get-AreglmHome
$Dest = Join-Path $HomeDir 'ツール本体'
Write-Step "本物のツールをここに入れます → $Dest"
Write-Host '（「AIツール開発プロジェクト」はメモのまま残します。触りません）'
Write-Host 'リポジトリは非公開です。GitHub ログイン済みの Git / gh / ZIP を使います。'

$入れた = $false

if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Step 'Git で GitHub から取得'
    try {
        if (Test-Path -LiteralPath (Join-Path $Dest '.git')) {
            Push-Location $Dest
            git fetch origin $Branch
            git checkout $Branch
            git pull origin $Branch
            Pop-Location
            $入れた = $true
        } elseif (Test-Path -LiteralPath $Dest) {
            $使用済み = Join-Path $HomeDir '使用済み'
            New-Item -ItemType Directory -Force -Path $使用済み | Out-Null
            $退避 = Join-Path $使用済み ("ツール本体_旧_" + (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
            Move-Item -LiteralPath $Dest -Destination $退避 -Force
            git clone --branch $Branch --single-branch $Repo $Dest
            $入れた = $true
        } else {
            git clone --branch $Branch --single-branch $Repo $Dest
            $入れた = $true
        }
    } catch {
        Write-Host ("git clone に失敗: " + $_.Exception.Message) -ForegroundColor Yellow
        $入れた = $false
        if (Get-Location | Where-Object { $_.Path -eq $Dest }) { Pop-Location -ErrorAction SilentlyContinue }
    }
} else {
    Write-Host 'Git が入っていません。gh または ZIP に切り替えます。' -ForegroundColor Yellow
}

if (-not $入れた -or -not (Test-Path -LiteralPath (Join-Path $Dest '見張り.ps1'))) {
    $入れた = Install-FromZip -Dest $Dest -HomeDir $HomeDir
}

if (-not $入れた -or -not (Test-Path -LiteralPath (Join-Path $Dest '見張り.ps1'))) {
    Show-ZipGuide -Dest $Dest
    # 案内テキストだけ先に置いておく
    $案内 = Join-Path $HomeDir 'ここがアプリです_ツール本体を開いてください.txt'
    @"
AReGLM のアプリ本体は、隣のフォルダ「ツール本体」です（まだ空なら GitHub の ZIP を入れてください）。

GitHub（ログイン必須・非公開リポジトリ）:
$BranchPage
緑の Code → Download ZIP → 解凍した中身を「ツール本体」へ

× AIツール開発プロジェクト\README.md  … メモ用
○ ツール本体\                        … 本物（見張り.ps1・server など）
"@ | Set-Content -LiteralPath $案内 -Encoding UTF8
    explorer.exe $HomeDir
    exit 2
}

$ps1 = Join-Path $Dest '見張り.ps1'

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
Write-Host ' できました（GitHub から入れました）'
Write-Host " 本物の場所: $Dest"
Write-Host ' エクスプローラーで「ツール本体」を開きます'
Write-Host ' （AIツール開発プロジェクト ではありません）'
if ($置いた.Count -gt 0) {
    Write-Host ' デスクトップの AReGLM アイコンからも開けます'
}
Write-Host '========================================' -ForegroundColor Green

explorer.exe $Dest
if ($置いた.Count -gt 0) {
    Start-Sleep -Seconds 1
    explorer.exe /select,$($置いた[0])
}
