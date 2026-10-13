param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $demoRoot 'output/backend'
$pidFile = Join-Path $logDir 'processes.json'
$pythonExe = (Join-Path $demoRoot '.venv\Scripts\python.exe')
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$script:demoServiceRecords = @()
if (Test-Path -LiteralPath $pidFile) {
  $loadedRecords = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  foreach ($record in $loadedRecords) {
    if ($record.name -and $record.pid -and $record.marker) { $script:demoServiceRecords += $record }
  }
}
if ($Stop) {
  foreach ($record in $script:demoServiceRecords) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -like "*$($record.marker)*") { Stop-Process -Id $record.pid -Force }
  }
  ConvertTo-Json -InputObject @() | Set-Content -LiteralPath $pidFile -Encoding utf8
  Write-Output 'Demo services stopped (external Vite processes are preserved).'
  exit
}
if (!(Test-Path -LiteralPath $pythonExe)) { throw 'Create .venv and install backend/requirements.txt first. See docs/backend-integration.md.' }
function Record-Service($name, $servicePid, $marker) {
  $script:demoServiceRecords = @($script:demoServiceRecords | Where-Object { $_.name -ne $name })
  $script:demoServiceRecords += [pscustomobject]@{name=$name;pid=$servicePid;marker=$marker}
}
function Launch-Service($name, $exe, $arguments, $marker) {
  $proc = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $demoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir "$name.stdout.log") -RedirectStandardError (Join-Path $logDir "$name.stderr.log")
  Record-Service $name $proc.Id $marker
}
$nodeExe = (Get-Command node.exe).Source
$brokerListener = Get-NetTCPConnection -State Listen -LocalPort 1883 -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$brokerListener) { Launch-Service 'broker' $nodeExe 'backend/broker.mjs' 'backend/broker.mjs' }
else { Write-Output 'MQTT port 1883 already listening, reusing.' }
for ($i=0; $i -lt 30; $i++) {
  if (Get-NetTCPConnection -State Listen -LocalPort 1883 -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Milliseconds 200
}
if (!(Get-NetTCPConnection -State Listen -LocalPort 1883 -ErrorAction SilentlyContinue)) { throw 'Broker failed: inspect output/backend/broker.stderr.log' }
# Match the exact workspace Python executable, even if the pid file was lost.
$ownedMec = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $pythonExe -and $_.CommandLine -like '*backend/service.py*' })
if ($ownedMec.Count -gt 1) { throw 'Multiple MEC services found for this workspace; stop duplicates before restarting.' }
if ($ownedMec.Count -eq 1) { Record-Service 'mec' $ownedMec[0].ProcessId 'backend/service.py'; Write-Output 'MEC process already running, reusing.' }
else { Launch-Service 'mec' $pythonExe '-u backend/service.py' 'backend/service.py' }
$viteListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$viteListener) { Launch-Service 'vite' $nodeExe 'node_modules/vite/bin/vite.js --host 127.0.0.1' 'node_modules/vite/bin/vite.js' }
else { Write-Output 'Vite port 3000 already listening, reusing.' }
# Explicit InputObject avoids Windows PowerShell wrapping nested arrays on reruns.
ConvertTo-Json -InputObject @($script:demoServiceRecords) -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8
Push-Location $demoRoot
try { & node scripts/backend-health.mjs; if ($LASTEXITCODE -ne 0) { throw 'MEC startup health check failed.' } } finally { Pop-Location }
Write-Output 'Demo URL: http://127.0.0.1:3000/r3f.html'
Write-Output 'Logs: output/backend/ (Gemini configuration stays in backend environment).'
