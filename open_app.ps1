param([int]$Delay = 2)
# Open the care assistant as a chromeless "app window" (Edge/Chrome app mode).
Start-Sleep -Seconds $Delay

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

$url = 'http://127.0.0.1:8787'
if ($exe) {
  Start-Process -FilePath $exe -ArgumentList "--app=$url", '--window-size=1200,960', '--window-position=120,50'
} else {
  Start-Process $url
}
