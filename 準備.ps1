# AReGLM を動かす・作り続けるのに要るものを揃える（Windows版）
#
# 入れるのはすべて無料で、winget（Microsoft 公式）から取る:
#   Node.js LTS / Python 3.12 / Git / Google Chrome / ffmpeg（任意）
#   numpy・Pillow（任意で faster-whisper） … PyPI
# 終わったら、デスクトップに AReGLM を置く。
# アカウントや鍵（GitHub・SwitchBot・SUZURI など）は、ご自身で作って設定に入れてください。

$ErrorActionPreference = 'Continue'
$TOOL = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $TOOL
$足りない = New-Object System.Collections.Generic.List[string]

function 聞く([string]$問い) {
    $答 = Read-Host "$問い [y/N]"
    return $答 -match '^(y|Y|はい)'
}

function PATHを読み直す {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function ある([string]$名前) {
    return [bool](Get-Command $名前 -ErrorAction SilentlyContinue)
}

Write-Host '== AReGLM の準備 =='
Write-Host ''

$winget = ある 'winget'
if (-not $winget) {
    Write-Host '✗ winget が見つかりません。Microsoft Store の「アプリ インストーラー」を入れてから、もう一度開いてください。'
}

$入れるもの = @(
    @{ 名 = 'Node.js LTS'; id = 'OpenJS.NodeJS.LTS'; 確かめ = { ある 'node' }; 必須 = $true },
    @{ 名 = 'Python 3.12'; id = 'Python.Python.3.12'; 確かめ = { (ある 'py') -or (ある 'python') }; 必須 = $true },
    @{ 名 = 'Git'; id = 'Git.Git'; 確かめ = { ある 'git' }; 必須 = $true },
    @{ 名 = 'Google Chrome'; id = 'Google.Chrome'; 確かめ = {
        (Test-Path (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')) -or
        (Test-Path (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')) }; 必須 = $false }
)

$無いもの = @($入れるもの | Where-Object { -not (& $_.確かめ) })
foreach ($x in $入れるもの) {
    if (& $x.確かめ) { Write-Host "✓ $($x.名)" }
}
if ($無いもの.Count -gt 0 -and $winget) {
    Write-Host ''
    Write-Host ('入っていないもの: ' + (($無いもの | ForEach-Object { $_.名 }) -join '、'))
    if (聞く 'winget で入れますか？（すべて無料）') {
        foreach ($x in $無いもの) {
            Write-Host "… $($x.名) を入れています"
            winget install --id $x.id -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
        }
        PATHを読み直す
    }
}
foreach ($x in $入れるもの) {
    if ($x.必須 -and -not (& $x.確かめ)) { $足りない.Add($x.名) }
}

# --- サーバーの部品 ---
if (ある 'npm') {
    & npm install --prefix (Join-Path $TOOL 'server') --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host '✓ サーバーの部品（express）' } else { $足りない.Add('サーバーの部品（server で npm install）') }
}

# --- Python の部品 ---
$py = $null
if (ある 'py') { $py = @('py', '-3') } elseif (ある 'python') { $py = @('python') }
if ($py) {
    $本体 = $py[0]
    $前 = @($py | Select-Object -Skip 1)
    & $本体 @前 -m pip install --user -q -r (Join-Path $TOOL 'server\ai\requirements.txt')
    if ($LASTEXITCODE -eq 0) { Write-Host '✓ numpy・Pillow' } else { $足りない.Add('numpy・Pillow') }
    & $本体 @前 -c 'import faster_whisper' 2>$null
    if ($LASTEXITCODE -ne 0) {
        if (聞く '声を文字にする部品（faster-whisper・数百MB）も入れますか？') {
            & $本体 @前 -m pip install --user -q -r (Join-Path $TOOL 'server\ai\requirements-voice.txt')
        }
    } else {
        Write-Host '✓ faster-whisper'
    }
}

# --- ffmpeg（任意） ---
if (ある 'ffmpeg') {
    Write-Host '✓ ffmpeg'
} elseif ($winget -and (聞く '動画の解析に使う ffmpeg も入れますか？')) {
    winget install --id Gyan.FFmpeg -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
}

# --- デスクトップ（ホーム画面）に Mac と同じ役割のアプリを置く ---
Write-Host ''
Write-Host 'デスクトップに AReGLM アプリを置きます（README.md は説明文のままです）…'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $TOOL '見張り.ps1') -アプリにする

Write-Host ''
if ($足りない.Count -eq 0) {
    Write-Host '準備ができました。'
} else {
    Write-Host 'まだ足りないもの:'
    $足りない | ForEach-Object { Write-Host "  ・$_" }
}
Write-Host ''
Write-Host 'デスクトップの「AReGLM」がアプリです。それを開いてログインしてください。'
Write-Host 'アカウントと鍵（GitHub・SwitchBot・SUZURI など）は、ご自身で作ってから'
Write-Host 'AReGLM の 設定 →「準備の状態」に並んでいる順に入れてください。'
Write-Host ''
Read-Host 'Enter で閉じます' | Out-Null
