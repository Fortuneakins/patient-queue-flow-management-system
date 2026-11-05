param(
  [switch]$BaselineExisting
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if ($BaselineExisting) {
  Write-Warning 'This does not execute SQL. It marks existing migrations 001–008 as applied only after the runner checks schema markers. Take a verified backup first.'
  $confirmation = Read-Host 'Type BASELINE pqfms_db only after reviewing the existing schema and backup'
  if ($confirmation -ne 'BASELINE pqfms_db') {
    throw 'Baseline confirmation did not match; no database changes were made.'
  }
  $env:PQFMS_CONFIRM_BASELINE_REVIEWED = 'YES_I_VERIFIED_MIGRATIONS_001_008'
  npm --prefix backend run db:migrate -- --baseline-existing
} else {
  npm --prefix backend run db:migrate
}
if ($LASTEXITCODE -ne 0) {
  throw 'Migration command failed. Review the error and database state before retrying.'
}
