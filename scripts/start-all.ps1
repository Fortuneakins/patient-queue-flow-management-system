$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$effectiveNodeEnv = $env:NODE_ENV
if (!$effectiveNodeEnv -and (Test-Path (Join-Path $ProjectRoot '.env'))) {
  $envText = Get-Content (Join-Path $ProjectRoot '.env') -Raw
  if ($envText -match '(?m)^NODE_ENV=(.+)
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit','-Command','Set-Location backend; npm start'
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit','-Command','python -m analytics_service.app'
Start-Process powershell -WorkingDirectory (Join-Path $ProjectRoot 'frontend') -ArgumentList '-NoExit','-Command','npm run dev'
Write-Host 'Backend:  http://localhost:5000' -ForegroundColor Green
Write-Host 'Analytics: http://localhost:5001' -ForegroundColor Green
Write-Host 'Frontend:  http://localhost:5173' -ForegroundColor Green
) { $effectiveNodeEnv = $Matches[1].Trim() }
}
if ([string]$effectiveNodeEnv -eq 'production') {
  throw 'start-all.ps1 is a development launcher and starts Vite dev mode. Do not use it for production; follow the production deployment guide and use a production static server and WSGI server.'
}

Write-Host 'Starting PQFMS components...' -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit','-Command','Set-Location backend; npm start'
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit','-Command','python -m analytics_service.app'
Start-Process powershell -WorkingDirectory (Join-Path $ProjectRoot 'frontend') -ArgumentList '-NoExit','-Command','npm run dev'
Write-Host 'Backend:  http://localhost:5000' -ForegroundColor Green
Write-Host 'Analytics: http://localhost:5001' -ForegroundColor Green
Write-Host 'Frontend:  http://localhost:5173' -ForegroundColor Green
