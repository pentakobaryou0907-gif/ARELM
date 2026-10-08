param([switch]$Removed)
# ARELM に、この PC のどこに入れたか（または消したか）を知らせる。
# 知らせられなくても、入れたこと・消したこと自体には影響しない。
$ErrorActionPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$token = ''
if (Test-Path (Join-Path $here 'ARELM-report.txt')) { $token = (Get-Content -Raw (Join-Path $here 'ARELM-report.txt')).Trim() }
$hosts = @(Get-Content (Join-Path $here 'ARELM-target.txt') | Where-Object { $_.Trim() })
$body = @{
  '印' = $token
  '消した' = [bool]$Removed
  'デスクトップ' = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ARELM.lnk')
  'スタートメニュー' = (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ARELM.lnk')
  '本体のフォルダ' = (Join-Path $env:LOCALAPPDATA 'ARELM')
  'コンピューター名' = $env:COMPUTERNAME
} | ConvertTo-Json
$bytes = [Text.Encoding]::UTF8.GetBytes($body)
foreach ($h in $hosts) {
  try {
    Invoke-RestMethod -Uri ('http://' + $h.Trim() + '/__installed') -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 4 | Out-Null
    if ($Removed) { Write-Host ' ARELM に、消したことを知らせました。' } else { Write-Host ' ARELM に、入れた場所を知らせました（設定の「3台の端末」で見られます）。' }
    break
  } catch {}
}
