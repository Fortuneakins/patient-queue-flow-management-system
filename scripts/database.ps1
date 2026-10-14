param(
  [string]$DbName = 'pqfms_db',
  [string]$DbUser = 'postgres',
  [string]$DbHost = 'localhost',
  [string]$DbPort = '5432'
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "Initialising database $DbName..." -ForegroundColor Cyan
$env:PGHOST=$DbHost; $env:PGPORT=$DbPort; $env:PGUSER=$DbUser
createdb $DbName 2>$null
foreach ($file in Get-ChildItem db\migrations\*.sql | Sort-Object Name) {
  Write-Host "Applying $($file.Name)" -ForegroundColor DarkCyan
  psql $DbName -v ON_ERROR_STOP=1 -f $file.FullName
}
psql $DbName -v ON_ERROR_STOP=1 -f db\seed\001_demo_data.sql
Write-Host 'Database initialised and demo data loaded.' -ForegroundColor Green
