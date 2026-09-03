# 見張り（Windows版）
#
# サーバーが落ちていないかを見て、落ちていたら黙って立て直す。
# 見張り.sh（Mac版）と同じ役目。中身の仕組み（PowerShellのAdd-Type等）は
# 実機のWindowsでは検証できていない。まず一度、手元のWindows機で
# 動きを確かめてから使ってほしい。
#
# 二重に動かないよう、目印のファイル（ロック）で見張っている。

$ErrorActionPreference = 'SilentlyContinue'

$TOOL = Split-Path -Parent $MyInvocation.MyCommand.Path
$LOGDIR = Join-Path $env:LOCALAPPDATA 'AReGLM\logs'
New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
$LOCK = Join-Path $LOGDIR '見張り.pid'

# すでに動いていれば、何もしないで終わる
if (Test-Path $LOCK) {
    $既存pid = Get-Content $LOCK -ErrorAction SilentlyContinue
    if ($既存pid -and (Get-Process -Id $既存pid -ErrorAction SilentlyContinue)) {
        exit 0
    }
}
$PID | Out-File -FilePath $LOCK -Encoding ascii
Register-EngineEvent PowerShell.Exiting -Action { Remove-Item $using:LOCK -ErrorAction SilentlyContinue } | Out-Null

# Python本体を探す（py ランチャー優先、無ければ python / python3）
function Find-Python {
    foreach ($候補 in @('py', 'python', 'python3')) {
        $場所 = Get-Command $候補 -ErrorAction SilentlyContinue
        if ($場所) { return $場所.Source }
    }
    return 'python'
}
$PY_BIN = Find-Python

function Test-Alive([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

while ($true) {
    if (-not (Test-Alive 'http://127.0.0.1:8090/api/health')) {
        Start-Process -FilePath 'node' -ArgumentList 'index.js' `
            -WorkingDirectory (Join-Path $TOOL 'server') `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $LOGDIR 'server.log') `
            -RedirectStandardError (Join-Path $LOGDIR 'server.err.log')
        Start-Sleep -Seconds 3
    }
    if (-not (Test-Alive 'http://127.0.0.1:8765/health')) {
        Start-Process -FilePath $PY_BIN -ArgumentList 'server.py' `
            -WorkingDirectory (Join-Path $TOOL 'server\ai') `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $LOGDIR 'ai.log') `
            -RedirectStandardError (Join-Path $LOGDIR 'ai.err.log')
        Start-Sleep -Seconds 6
    }
    Start-Sleep -Seconds 5
}
