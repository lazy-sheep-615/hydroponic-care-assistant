<#
  无头浏览器截图工具（视觉自查用）
  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\shot.ps1 -Url http://127.0.0.1:8787/ -Out shot.png
    ... -Width 1280 -Height 2200 -WaitMs 6000
  注意：纯 ASCII 脚本，避免 PowerShell 5.1 按 GBK 读取导致中文乱码。
#>
param(
  [string]$Url = 'http://127.0.0.1:8787/',
  [string]$Out = 'shot.png',
  [int]$Width = 1280,
  [int]$Height = 1500,
  [int]$WaitMs = 5000
)

$cands = @(
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$exe = $null
foreach ($c in $cands) { if ($c -and (Test-Path -LiteralPath $c)) { $exe = $c; break } }
if (-not $exe) { Write-Error 'No Edge/Chrome found.'; exit 1 }

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
if (Test-Path $Out) { Remove-Item $Out -Force }

& $exe --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=$WaitMs `
       "--window-size=$Width,$Height" "--screenshot=$Out" $Url 2>$null

Start-Sleep -Milliseconds 800
if (Test-Path $Out) {
  Write-Output ("OK  " + $Out + "  " + [math]::Round((Get-Item $Out).Length / 1KB, 1) + " KB")
} else {
  Write-Error 'Screenshot failed.'
  exit 1
}
