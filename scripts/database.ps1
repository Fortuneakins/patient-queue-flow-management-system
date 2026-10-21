param(
  [string]$DbName = 'pqfms_db',
  [string]$DbUser = 'postgres',
  [string]$DbHost = 'localhost',
  [string]$DbPort = '5432'
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$effectiveNodeEnv = $env:NODE_ENV
if (!$effectiveNodeEnv -and (Test-Path .env)) {
  $envText = Get-Content .env -Raw
  if ($envText -match '(?m)^NODE_ENV=(.+)$') { $effectiveNodeEnv = $Matches[1].Trim() }
}
if ([string]$effectiveNodeEnv -eq 'production') {
  throw 'Refusing to initialise/seed a production database. This script loads demonstration users and patients. Use the reviewed production migration procedure instead.'
}

$env:PGHOST = $DbHost
$env:PGPORT = $DbPort
$env:PGUSER = $DbUser
$env:DB_HOST = $DbHost
$env:DB_PORT = $DbPort
$env:DB_USER = $DbUser
$env:DB_NAME = $DbName

Write-Host "Creating fresh development database $DbName..." -ForegroundColor Cyan
createdb $DbName
if ($LASTEXITCODE -ne 0) {
  throw "Database creation failed. The database may already exist. Do not rerun migrations blindly; use .\scripts\migrate.ps1 to inspect/apply pending migrations."
}

Write-Host 'Applying checksum-tracked SQL migrations...' -ForegroundColor DarkCyan
npm --prefix backend run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Tracked migrations failed. Do not load demo seed data.' }

Write-Host 'Loading explicitly synthetic demo users and reference patients...' -ForegroundColor DarkCyan
psql $DbName -v ON_ERROR_STOP=1 -f db\seed\001_demo_data.sql
if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed. The schema was migrated, but seed data was not fully applied.' }

Write-Host 'Fresh development database initialised and demo data loaded.' -ForegroundColor Green
