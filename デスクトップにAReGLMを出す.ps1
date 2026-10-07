# デスクトップ（ホーム画面）に AReGLM アプリを必ず出す
#
# メモ用 README だけではアプリになりません。
# このスクリプトは:
#   1) GitHub から本物を「AReGLM\ツール本体」へ入れる
#   2) OneDrive デスクトップなど、見えるホーム画面すべてに AReGLM.lnk を置く
#   3) エクスプローラーでそのアイコンを選択して見せる
#
# PowerShell で実行（Git ログイン済み）:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   irm は非公開リポジトリでは使えません。このファイルをツール本体に置いて:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\デスクトップにAReGLMを出す.ps1
#
# または（まだ何も無い Windows で）Git があれば:
#   git clone --branch cursor/three-devices-home-1936 --single-branch https://github.com/pentakobaryou0907-gif/ARELM.git "$env:USERPROFILE\OneDrive\デスクトップ\AReGLM\ツール本体"
#   & "$env:USERPROFILE\OneDrive\デスクトップ\AReGLM\ツール本体\デスクトップにAReGLMを出す.ps1"

$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/pentakobaryou0907-gif/ARELM.git'
$Branch = 'cursor/three-devices-home-1936'

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

function Ensure-ToolBody([string]$Dest) {
    if (Test-Path -LiteralPath (Join-Path $Dest '見張り.ps1')) { return $true }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host 'Git がありません。https://git-scm.com/download/win から入れてください。' -ForegroundColor Red
        return $false
    }
    Write-Host "GitHub から入れます → $Dest"
    if (Test-Path -LiteralPath (Join-Path $Dest '.git')) {
        Push-Location $Dest
        git fetch origin $Branch
        git checkout $Branch
        git pull origin $Branch
        Pop-Location
    } elseif (Test-Path -LiteralPath $Dest) {
        $使用済み = Join-Path (Split-Path $Dest) '使用済み'
        New-Item -ItemType Directory -Force -Path $使用済み | Out-Null
        Move-Item -LiteralPath $Dest -Destination (Join-Path $使用済み ("ツール本体_旧_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))) -Force
        git clone --branch $Branch --single-branch $Repo $Dest
    } else {
        git clone --branch $Branch --single-branch $Repo $Dest
    }
    return (Test-Path -LiteralPath (Join-Path $Dest '見張り.ps1'))
}

# スクリプト自身がツール本体内にあればそれを使う。無ければ OneDrive 下へ入れる。
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path -LiteralPath (Join-Path $here '見張り.ps1')) {
    $Dest = $here
} else {
    $HomeDir = Get-AreglmHome
    $Dest = Join-Path $HomeDir 'ツール本体'
    if (-not (Ensure-ToolBody $Dest)) {
        # ブラウザで ZIP 案内
        Start-Process "https://github.com/pentakobaryou0907-gif/ARELM/tree/$Branch"
        throw "ツール本体を入れられませんでした。GitHub の ZIP を $Dest へ入れてから、もう一度実行してください。"
    }
}

$ps1 = Join-Path $Dest '見張り.ps1'
Write-Host "デスクトップへアイコンを置きます（本体: $Dest）"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 -アプリにする -静かに

# 置いた .lnk を全部探して、無いデスクトップにもコピー
$lnk一覧 = @()
$デスクトップたち = @(
    (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'デスクトップ')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$元 = $null
foreach ($d in $デスクトップたち) {
    $c = Join-Path $d 'AReGLM.lnk'
    if (Test-Path -LiteralPath $c) { $元 = $c; $lnk一覧 += $c }
}
if (-not $元) {
    # 見張りが失敗したとき、ここで直接ショートカットを作る
    $vbs = Join-Path $Dest 'AReGLM起動.vbs'
    $ico = Join-Path $Dest 'images\areglm.ico'
    $shell = New-Object -ComObject WScript.Shell
    foreach ($d in $デスクトップたち) {
        $lnk = Join-Path $d 'AReGLM.lnk'
        $sc = $shell.CreateShortcut($lnk)
        if (Test-Path -LiteralPath $vbs) {
            $sc.TargetPath = $vbs
        } else {
            $sc.TargetPath = 'powershell.exe'
            $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`" -ホームから"
        }
        $sc.WorkingDirectory = $Dest
        $sc.Description = 'AReGLM'
        if (Test-Path -LiteralPath $ico) { $sc.IconLocation = "$ico,0" }
        $sc.Save()
        $lnk一覧 += $lnk
        if (-not $元) { $元 = $lnk }
    }
} else {
    # 片方のデスクトップにしか無い場合、もう片方へもコピー
    foreach ($d in $デスクトップたち) {
        $lnk = Join-Path $d 'AReGLM.lnk'
        if (-not (Test-Path -LiteralPath $lnk)) {
            Copy-Item -LiteralPath $元 -Destination $lnk -Force
            $lnk一覧 += $lnk
        }
    }
}

# 目印のテキストもデスクトップへ（アイコンに気づきやすくする）
foreach ($d in $デスクトップたち) {
    $txt = Join-Path $d 'AReGLMはここにあります.txt'
    @"
デスクトップの「AReGLM」アイコンがアプリです。
ダブルクリックで開きます。

本体フォルダ: $Dest
（AIツール開発プロジェクト\README.md はメモ用です）
"@ | Set-Content -LiteralPath $txt -Encoding UTF8
}

Write-Host ''
Write-Host 'できました。デスクトップの AReGLM がアプリです。' -ForegroundColor Green
foreach ($x in ($lnk一覧 | Select-Object -Unique)) { Write-Host "  $x" }

if ($元) {
    explorer.exe /select,$元
} else {
    explorer.exe (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ')
}
