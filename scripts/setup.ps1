$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function New-RandomSecret([int]$Length = 48) {
  $bytes = New-Object byte[] $Length
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create(); try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, $Length)
}

function Ensure-EnvValue([string]$Path, [string]$Name, [string]$Value) {
  $content = Get-Content $Path -Raw
  $escaped = [regex]::Escape($Name)
  if ($content -match "(?m)^$escaped=") {
    $content = [regex]::Replace($content, "(?m)^$escaped=.*$", "$Name=$Value")
  } else {
    $content += "`n$Name=$Value`n"
  }
  Set-Content -Path $Path -Value $content -Encoding utf8 -NoNewline
}

Write-Host 'PQFMS setup' -ForegroundColor Cyan
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (!(Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
if (!(Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python is required.' }
if (!(Get-Command psql -ErrorAction SilentlyContinue)) { throw 'PostgreSQL client (psql) is required.' }

if (!(Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Created root .env from .env.example.' -ForegroundColor Yellow
}

$envText = Get-Content .env -Raw
if ($envText -match '(?m)^JWT_SECRET=(GENERATED_BY_SETUP_SCRIPT)?$') {
  Ensure-EnvValue '.env' 'JWT_SECRET' (New-RandomSecret 48)
}
$envText = Get-Content .env -Raw
if ($envText -match '(?m)^INTERNAL_SERVICE_TOKEN=(GENERATED_BY_SETUP_SCRIPT)?$') {
  Ensure-EnvValue '.env' 'INTERNAL_SERVICE_TOKEN' (New-RandomSecret 48)
}

if (!(Test-Path frontend\.env.local)) {
@"
VITE_API_BASE_URL=http://localhost:5000
VITE_ANALYTICS_BASE_URL=http://localhost:5001
VITE_SOCKET_URL=http://localhost:5000
"@ | Set-Content frontend\.env.local -Encoding utf8
}

Write-Host 'Installing backend dependencies...' -ForegroundColor DarkCyan
Push-Location backend
npm ci
Pop-Location

Write-Host 'Installing frontend dependencies...' -ForegroundColor DarkCyan
Push-Location frontend
npm ci
Pop-Location

Write-Host 'Installing analytics dependencies...' -ForegroundColor DarkCyan
Push-Location analytics_service
python -m pip install -r requirements-dev.txt
Pop-Location

Write-Host 'Dependencies installed and local secrets provisioned.' -ForegroundColor Green
Write-Host 'Next: run .\scripts\database.ps1, then .\scripts\start-all.ps1' -ForegroundColor Green
