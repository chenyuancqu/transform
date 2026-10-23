$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $runtime)) { $runtime = (Get-Command python.exe -ErrorAction Stop).Source }
Push-Location $root
try { & $runtime -m unittest discover -s tests -p 'test_*.py' -v; exit $LASTEXITCODE }
finally { Pop-Location }
