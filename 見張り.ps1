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
    [switch]$ブラウザを開く,
    [switch]$ホームから,
    [switch]$ホームに置く,
    # 「アプリにする」は「ホームに置く」と同じ。名前を分かりやすくした入口。
    [switch]$アプリにする,
    # 確認ウィンドウを出さない（スタートアップや自動配置用）
    [switch]$静かに
)
if ($アプリにする) { $ホームに置く = $true }

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$SCRIPT = $MyInvocation.MyCommand.Path
$TOOL = Split-Path -Parent $SCRIPT
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

function Find-Edge {
    $候補 = @(
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
    )
    foreach ($場所 in $候補) {
        if ($場所 -and (Test-Path -LiteralPath $場所)) { return $場所 }
    }
    return $null
}

# デスクトップに誤って置かれた「AReGLM」という名前の .bat などを、
# 消さずに「使用済み」へ移す。本体フォルダをデスクトップへ移したつもりで
# 隣の server を見失う事故を防ぐ。代わりにアイコン付きのアプリ（.lnk）を置く。
function Move-OrphanDesktopLaunchers {
    $使用済み = Join-Path $env:LOCALAPPDATA 'AReGLM\使用済み'
    New-Item -ItemType Directory -Force -Path $使用済み | Out-Null
    $印 = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $デスクトップ一覧 = New-Object System.Collections.Generic.List[string]
    foreach ($候補 in @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ'),
        (Join-Path $env:USERPROFILE 'デスクトップ')
    )) {
        if ($候補 -and (Test-Path -LiteralPath $候補) -and -not $デスクトップ一覧.Contains($候補)) {
            $デスクトップ一覧.Add($候補)
        }
    }
    $名前たち = @(
        'AReGLM.bat', 'AReGLM.cmd', 'AReGLM.vbs',
        'AReGLMを開く.bat', 'AReGLMアプリにする.bat', 'ホーム画面に置く.bat'
    )
    foreach ($desk in $デスクトップ一覧) {
        foreach ($名前 in $名前たち) {
            $p = Join-Path $desk $名前
            if (-not (Test-Path -LiteralPath $p)) { continue }
            # ツール本体の中にある同名ファイルは触らない（デスクトップへコピーされたものだけ）。
            try {
                $本体側 = Join-Path $TOOL $名前
                if ((Test-Path -LiteralPath $本体側) -and ((Resolve-Path -LiteralPath $p).Path -eq (Resolve-Path -LiteralPath $本体側).Path)) {
                    continue
                }
            } catch { }
            try {
                $先 = Join-Path $使用済み ("{0}_{1}{2}" -f [IO.Path]::GetFileNameWithoutExtension($名前), $印, [IO.Path]::GetExtension($名前))
                Move-Item -LiteralPath $p -Destination $先 -Force
                Write-Log "デスクトップの誤った入口を使用済みへ移しました: $p → $先"
            } catch {
                Write-Log "使用済みへ移せませんでした ($p): $($_.Exception.Message)"
            }
        }
    }
}

# デスクトップとスタートメニューに、ログイン画面を開くアイコン付きアプリを置く。
# 本体のフォルダは移さない。アイコンだけをホーム画面側に出す（Mac の AReGLM.app と同じ役割）。
function Install-HomeShortcut {
    Move-OrphanDesktopLaunchers

    $ico = Join-Path $TOOL 'images\areglm.ico'
    $vbs = Join-Path $TOOL 'AReGLM起動.vbs'
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $powershell)) { $powershell = 'powershell.exe' }
    $引数 = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$SCRIPT`" -ホームから"

    if (-not (Test-Path -LiteralPath $ico)) {
        Write-Log "アイコン画像がありません: $ico （ショートカットは作れますが、見た目は普通の矢印になります）"
    }
    if (-not (Test-Path -LiteralPath $vbs)) {
        Write-Log "AReGLM起動.vbs がありません。PowerShell 直起動にします"
    }

    $場所一覧 = New-Object System.Collections.Generic.List[string]
    foreach ($候補 in @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ'),
        (Join-Path $env:USERPROFILE 'デスクトップ')
    )) {
        if ($候補 -and (Test-Path -LiteralPath $候補) -and -not $場所一覧.Contains($候補)) {
            $場所一覧.Add($候補)
        }
    }
    $programs = [Environment]::GetFolderPath('Programs')
    if ($programs) {
        $startDir = Join-Path $programs 'AReGLM'
        New-Item -ItemType Directory -Force -Path $startDir | Out-Null
        $場所一覧.Add($startDir)
        if (-not $場所一覧.Contains($programs)) { $場所一覧.Add($programs) }
    }

    $作った = New-Object System.Collections.Generic.List[string]
    foreach ($dir in $場所一覧) {
        if (-not $dir) { continue }
        try {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
            $lnk = Join-Path $dir 'AReGLM.lnk'
            # 古いショートカットが壊れていることがあるので、消さずに使用済みへ移してから作り直す。
            if (Test-Path -LiteralPath $lnk) {
                try {
                    $使用済み = Join-Path $env:LOCALAPPDATA 'AReGLM\使用済み'
                    New-Item -ItemType Directory -Force -Path $使用済み | Out-Null
                    $退避 = Join-Path $使用済み ("AReGLM_旧_{0}.lnk" -f (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
                    Move-Item -LiteralPath $lnk -Destination $退避 -Force
                } catch {
                    # 移せなくても、上書きで CreateShortcut できることが多い。
                }
            }
            $shell = New-Object -ComObject WScript.Shell
            $sc = $shell.CreateShortcut($lnk)
            if (Test-Path -LiteralPath $vbs) {
                # VBS経由なら、黒い窓が一瞬も出ない。
                $sc.TargetPath = $vbs
                $sc.Arguments = ''
            } else {
                $sc.TargetPath = $powershell
                $sc.Arguments = $引数
            }
            $sc.WorkingDirectory = $TOOL
            $sc.WindowStyle = 7
            $sc.Description = 'AReGLM（ログイン画面を開くアプリ）'
            if (Test-Path -LiteralPath $ico) { $sc.IconLocation = "$ico,0" }
            $sc.Save()
            $作った.Add($lnk)
            Write-Log "アプリを置きました: $lnk"
        } catch {
            Write-Log "ショートカット作成失敗 ($dir): $($_.Exception.Message)"
        }
    }

    try {
        $desktop = [Environment]::GetFolderPath('Desktop')
        if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
        $lnk = Join-Path $desktop 'AReGLM.lnk'
        if (-not (Test-Path -LiteralPath $lnk) -and $作った.Count -gt 0) {
            $lnk = $作った[0]
        }
        $shellApp = New-Object -ComObject Shell.Application
        $folder = $shellApp.NameSpace((Split-Path -Parent $lnk))
        $item = $folder.ParseName((Split-Path -Leaf $lnk))
        if ($item) {
            foreach ($verb in @($item.Verbs())) {
                $名前 = [string]$verb.Name
                if ($名前 -match '解除|Unpin|タスクバー|taskbar') { continue }
                if ($名前 -match 'スタート|Pin to Start') {
                    $verb.DoIt()
                    Write-Log "スタートにピン留めしました"
                    break
                }
            }
        }
    } catch {
        Write-Log "スタートへのピン留めはスキップしました: $($_.Exception.Message)"
    }

    # サインインのたびに見張りを裏で立ち上げる（Mac版の常駐と同じ役目）。
    # 見張りは起動時にデスクトップのアイコンを確かめ、無ければ置き直す。
    # 本体がデスクトップ・書類・OneDrive の下にあるときは登録しない
    # （クラウド同期の一時的な欠落で、無いパスを指したまま立ち上がろうとするため。
    # Mac の LaunchAgent 登録と同じ判断）。
    $同期の下 = $false
    foreach ($印 in @('\Desktop\', '\デスクトップ\', '\Documents\', '\書類\', '\OneDrive\')) {
        if ($TOOL -like "*$印*") { $同期の下 = $true; break }
    }
    if ($同期の下) {
        Write-Log "本体がデスクトップ／書類／OneDrive の下にあるので、サインイン時の見張りは登録しません: $TOOL"
    } else {
        try {
            $startup = [Environment]::GetFolderPath('Startup')
            if ($startup) {
                $shell = New-Object -ComObject WScript.Shell
                $sc = $shell.CreateShortcut((Join-Path $startup 'AReGLM見張り.lnk'))
                $sc.TargetPath = $powershell
                $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$SCRIPT`""
                $sc.WorkingDirectory = $TOOL
                $sc.WindowStyle = 7
                $sc.Description = 'AReGLM の見張り（サーバーを保ち、ホーム画面のアイコンを戻す）'
                if (Test-Path -LiteralPath $ico) { $sc.IconLocation = "$ico,0" }
                $sc.Save()
                Write-Log "サインイン時の見張りを登録しました（スタートアップ）"
            }
        } catch {
            Write-Log "サインイン時の見張りを登録できませんでした: $($_.Exception.Message)"
        }

        # Startup のショートカットは「落ちたら立ち上がり直す」が無い。
        # Mac の KeepAlive と同じく、タスクスケジューラで 1 分ごとに
        # 「動いていなければ起こす」ようにする（常時二重起動は Take-Lock で防ぐ）。
        try {
            $任務名 = 'AReGLM見張り'
            $起こす = @"
`$ps1 = '$($SCRIPT.Replace("'","''"))'
`$powershell = Join-Path `$env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
`$pidFile = Join-Path `$env:LOCALAPPDATA 'AReGLM\logs\見張り.lock\pid'
if (Test-Path -LiteralPath `$pidFile) {
  `$既存 = Get-Content -LiteralPath `$pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if (`$既存 -and (Get-Process -Id `$既存 -ErrorAction SilentlyContinue)) { exit 0 }
}
Start-Process -FilePath `$powershell -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',`$ps1)
"@
            $起こすPath = Join-Path $LOGDIR '見張りを起こす.ps1'
            Set-Content -LiteralPath $起こすPath -Value $起こす -Encoding UTF8
            $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$起こすPath`""
            $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue)
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
            Register-ScheduledTask -TaskName $任務名 -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
            Write-Log "サインイン時の見張りを登録しました（タスクスケジューラ・1分ごとに確認）"
        } catch {
            Write-Log "タスクスケジューラへの登録はスキップしました: $($_.Exception.Message)"
        }
    }
    return $作った
}

function Test-HomeShortcut {
    foreach ($候補 in @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\デスクトップ')
    )) {
        if ($候補 -and (Test-Path -LiteralPath (Join-Path $候補 'AReGLM.lnk'))) { return $true }
    }
    return $false
}

function Start-WatcherIfNeeded {
    $pidFile = Join-Path $LOGDIR '見張り.lock\pid'
    if (Test-Path -LiteralPath $pidFile) {
        $既存 = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($既存 -and (Get-Process -Id $既存 -ErrorAction SilentlyContinue)) { return }
    }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $powershell)) { $powershell = 'powershell.exe' }
    Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', $SCRIPT
    )
}

function Open-LoginWindow([string]$url) {
    # アドレスバーの無いアプリの窓で開く。最初に出るのはログイン画面。
    $chrome = Find-Chrome
    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList @("--app=$url")
        return
    }
    $edge = Find-Edge
    if ($edge) {
        Start-Process -FilePath $edge -ArgumentList @("--app=$url")
        return
    }
    Start-Process $url
}

function Still-Running($proc) {
    if (-not $proc) { return $false }
    try { return -not $proc.HasExited } catch { return $false }
}

# --- ホーム画面にアイコンだけ置く（サーバーは起こさない） ---
if ($ホームに置く) {
    try {
        $作った = @(Install-HomeShortcut)
    } catch {
        Write-Log "アイコンを置けませんでした: $($_.Exception.Message)"
        $作った = @()
    }
    if ($作った.Count -eq 0) {
        $文 = "デスクトップにアイコンを置けませんでした。`r`nログ: $(Join-Path $LOGDIR '見張り.log')"
        Write-Host $文
        try {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM', 'OK', 'Error') | Out-Null
        } catch { }
        exit 1
    }
    $一覧 = ($作った | ForEach-Object { "・$_" }) -join "`r`n"
    $文 = @"
Mac のホーム画面の AReGLM と同じ役割のアプリを、この Windows のホーム画面（デスクトップ）に置きました。

$一覧

次からはデスクトップの「AReGLM」をダブルクリックするだけで開けます。
README.md は説明文です（アプリではありません）。
ツールのフォルダのファイルは、デスクトップへ移さないでください。
"@
    Write-Host $文
    if (-not $静かに) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.MessageBox]::Show($文, 'AReGLM — ホーム画面に置きました', 'OK', 'Information') | Out-Null
        } catch { }
    }
    exit 0
}

# --- 画面を開く（見張り本体には入らない） ---
if ($ブラウザを開く -or $ホームから) {
    try { [void](Install-HomeShortcut) } catch { Write-Log "アイコンを置けませんでした: $($_.Exception.Message)" }
    if ($ホームから) { Start-WatcherIfNeeded }

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
    # Windows では「アプリ枠」を開く（黒いまわりの中に本編の画面）。
    # README.md は説明文なのでアプリではない。開くのは アプリ枠.html。
    $入口 = 'http://127.0.0.1:8080'
    if (Test-Alive 'http://127.0.0.1:8090/api/health') {
        $入口 = 'http://127.0.0.1:8090'
    }
    $URL = "$入口/アプリ枠.html"
    if (-not (Test-Alive $URL)) {
        # 古い版に アプリ枠.html が無いときだけ、本編を直接開く。
        $URL = "$入口/"
    }

    Open-LoginWindow $URL
    Write-Host "アプリ画面を開きました: $URL"
    Write-Host "デスクトップの「AReGLM」がアプリです。次からはそのアイコンから開けます。"
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

if (-not (Test-HomeShortcut)) {
    try { [void](Install-HomeShortcut) } catch { Write-Log "アイコンを置けませんでした: $($_.Exception.Message)" }
}

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
