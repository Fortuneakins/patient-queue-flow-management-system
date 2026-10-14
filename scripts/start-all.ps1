$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host 'Starting PQFMS components...' -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit','-Command','Set-Location backend; npm start'
Start-Process powershell -WorkingDirectory $ProjectRoot -ArgumentList '-NoExit','-Command','python -m analytics_service.app'
Start-Process powershell -WorkingDirectory (Join-Path $ProjectRoot 'frontend') -ArgumentList '-NoExit','-Command','npm run dev'
Write-Host 'Backend:  http://localhost:5000' -ForegroundColor Green
Write-Host 'Analytics: http://localhost:5001' -ForegroundColor Green
Write-Host 'Frontend:  http://localhost:5173' -ForegroundColor Green
