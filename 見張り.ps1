# 見張り（デスクトップPC / Windows版）
#
# サーバーが落ちていないかを見て、落ちていたら黙って立て直す。
# 見張り.sh（Mac版）と同じ役目。
#
# 画面を開くときは、同じファイルを -ブラウザを開く で起動する。
# 見張り本体は裏で動き続けるので、ダブルクリックのたびに
# アプリが「もう起動している」と黙る、ということは起きない。
#
# 二重に動かないよう、目印のフォルダで見張っている。

param(
    [switch]$ブラウザを開く
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$TOOL = Split-Path -Parent $MyInvocation.MyCommand.Path
$LOGDIR = Join-Path $env:LOCALAPPDATA 'AReGLM\logs'
New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path (Join-Path $LOGDIR '見張り.log') -Value $line -Encoding utf8
}

function Test-Alive([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Find-Node {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $候補 = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )
    foreach ($場所 in $候補) {
        if ($場所 -and (Test-Path -LiteralPath $場所)) { return $場所 }
    }
    return $null
}

function Find-Python {
    foreach ($名前 in @('py', 'python', 'python3')) {
        $cmd = Get-Command $名前 -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) { return $cmd.Source }
    }
    return $null
}

function Find-Chrome {
    $候補 = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($場所 in $候補) {
        if ($場所 -and (Test-Path -LiteralPath $場所)) { return $場所 }
    }
    return $null
}

function Still-Running($proc) {
    if (-not $proc) { return $false }
    try { return -not $proc.HasExited } catch { return $false }
}

# --- 画面を開く（見張り本体には入らない） ---
if ($ブラウザを開く) {
    $届いた = $false
    for ($i = 0; $i -lt 120; $i++) {
        if (Test-Alive 'http://127.0.0.1:8080/api/health') {
            $届いた = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $届いた) {
        $文 = "AReGLM のサーバーが応答しませんでした。`r`nログ: $(Join-Path $LOGDIR '見張り.log')`r`nNode.js が入っているか確かめてください。"
        Write-Host $文
        try {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null
        } catch { }
        exit 1
    }

    # Mac のランチャーと同じく、キャッシュの影響を受けない 8090 を優先する。
    # 8090 が開いていなければ、本来の入口 8080 で開く。
    $URL = 'http://127.0.0.1:8080'
    if (Test-Alive 'http://127.0.0.1:8090/api/health') {
        $URL = 'http://127.0.0.1:8090'
    }

    $chrome = Find-Chrome
    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList $URL
    } else {
        Start-Process $URL
    }
    Write-Host "ブラウザで開きました: $URL"
    exit 0
}

# --- 見張り本体 ---
$LOCKDIR = Join-Path $LOGDIR '見張り.lock'

function Take-Lock {
    for ($i = 0; $i -lt 2; $i++) {
        $作れた = New-Item -ItemType Directory -Path $LOCKDIR -ErrorAction SilentlyContinue
        if ($作れた) { return $true }
        $pidFile = Join-Path $LOCKDIR 'pid'
        $既存 = $null
        if (Test-Path -LiteralPath $pidFile) {
            $既存 = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        }
        $生きている = $false
        if ($既存) {
            $生きている = [bool](Get-Process -Id $既存 -ErrorAction SilentlyContinue)
        }
        if ($生きている) { return $false }
        Remove-Item -LiteralPath $LOCKDIR -Recurse -Force -ErrorAction SilentlyContinue
    }
    return $false
}

if (-not (Take-Lock)) { exit 0 }
Set-Content -LiteralPath (Join-Path $LOCKDIR 'pid') -Value $PID -Encoding ascii

$serverDir = Join-Path $TOOL 'server'
$aiDir = Join-Path $serverDir 'ai'
$node = Find-Node
$python = Find-Python
$serverProc = $null
$aiProc = $null
$serverRetryAt = [datetime]::MinValue
$aiRetryAt = [datetime]::MinValue
$nodeMissingLogged = $false
$pythonMissingLogged = $false

Write-Log '見張りを開始しました'

if ($node -and -not (Test-Path -LiteralPath (Join-Path $serverDir 'node_modules\express\package.json'))) {
    $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) {
        $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if ($npmCmd) { $npm = $npmCmd.Source } else { $npm = $null }
    }
    if ($npm) {
        Write-Log '依存関係が無いので npm install を実行します'
        & $npm install --prefix $serverDir 2>&1 | Out-File -FilePath (Join-Path $LOGDIR 'npm.log') -Encoding utf8
    } else {
        Write-Log 'npm が見つからないため、依存関係を入れられません'
    }
}

try {
    while ($true) {
        if (-not (Test-Alive 'http://127.0.0.1:8080/api/health')) {
            if ((Get-Date) -ge $serverRetryAt -and -not (Still-Running $serverProc)) {
                if (-not $node) {
                    if (-not $nodeMissingLogged) {
                        Write-Log 'node が見つかりません。Node.js を入れるとサーバーを起動できます'
                        $nodeMissingLogged = $true
                    }
                    $serverRetryAt = (Get-Date).AddSeconds(60)
                } else {
                    try {
                        $serverProc = Start-Process -FilePath $node -ArgumentList @('index.js') `
                            -WorkingDirectory $serverDir -WindowStyle Hidden -PassThru `
                            -RedirectStandardOutput (Join-Path $LOGDIR 'server.log') `
                            -RedirectStandardError (Join-Path $LOGDIR 'server.err.log')
                        Start-Sleep -Seconds 2
                        if ($serverProc.HasExited) {
                            Write-Log "サーバーがすぐ終了しました (code $($serverProc.ExitCode))"
                            $serverProc = $null
                            $serverRetryAt = (Get-Date).AddSeconds(30)
                        }
                    } catch {
                        Write-Log "サーバーを起動できませんでした: $($_.Exception.Message)"
                        $serverProc = $null
                        $serverRetryAt = (Get-Date).AddSeconds(30)
                    }
                }
            }
        } else {
            $serverProc = $null
        }

        if (-not (Test-Alive 'http://127.0.0.1:8765/health')) {
            if ((Get-Date) -ge $aiRetryAt -and -not (Still-Running $aiProc)) {
                if (-not $python) {
                    if (-not $pythonMissingLogged) {
                        Write-Log 'python が見つかりません。自作AIは起動しません（画面自体は使えます）'
                        $pythonMissingLogged = $true
                    }
                    $aiRetryAt = (Get-Date).AddSeconds(60)
                } else {
                    try {
                        $aiProc = Start-Process -FilePath $python -ArgumentList @('server.py') `
                            -WorkingDirectory $aiDir -WindowStyle Hidden -PassThru `
                            -RedirectStandardOutput (Join-Path $LOGDIR 'ai.log') `
                            -RedirectStandardError (Join-Path $LOGDIR 'ai.err.log')
                        Start-Sleep -Seconds 2
                        if ($aiProc.HasExited) {
                            Write-Log "自作AIがすぐ終了しました (code $($aiProc.ExitCode))。numpy が入っていないことがあります"
                            $aiProc = $null
                            $aiRetryAt = (Get-Date).AddSeconds(60)
                        }
                    } catch {
                        Write-Log "自作AIを起動できませんでした: $($_.Exception.Message)"
                        $aiProc = $null
                        $aiRetryAt = (Get-Date).AddSeconds(60)
                    }
                }
            }
        } else {
            $aiProc = $null
        }

        Start-Sleep -Seconds 5
    }
} finally {
    Remove-Item -LiteralPath $LOCKDIR -Recurse -Force -ErrorAction SilentlyContinue
}
