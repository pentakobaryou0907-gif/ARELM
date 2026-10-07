# ASCII 名の入口（非公開リポジトリ用）
# GitHub にログインした状態で、このファイルを Raw 表示から保存するか、
# リポジトリを clone / ZIP 展開したあと、同じフォルダで実行してください。
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
#
# 中身は「Windowsにアプリを入れる.ps1」と同じ処理です。

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$main = Join-Path $here 'Windowsにアプリを入れる.ps1'
if (-not (Test-Path -LiteralPath $main)) {
    Write-Host '同じフォルダに Windowsにアプリを入れる.ps1 がありません。' -ForegroundColor Red
    Write-Host 'GitHub でブランチ cursor/windows-app-shell-1936 の ZIP を落とし、解凍してから実行してください。' -ForegroundColor Yellow
    Write-Host 'https://github.com/pentakobaryou0907-gif/ARELM/tree/cursor/windows-app-shell-1936'
    exit 1
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $main @args
exit $LASTEXITCODE
