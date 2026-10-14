param([string]$DbName='pqfms_db',[string]$DbUser='postgres')
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$env:PGUSER=$DbUser
psql $DbName -v ON_ERROR_STOP=1 -c "TRUNCATE queue_entries, login_events, shifts, patients, ticket_counters RESTART IDENTITY CASCADE;"
psql $DbName -v ON_ERROR_STOP=1 -f db\seed\001_demo_data.sql
Write-Host 'Demo data reset.' -ForegroundColor Green
