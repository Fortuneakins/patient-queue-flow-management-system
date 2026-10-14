param(
    [switch]$IncludeLoadTest
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Push-Location $ProjectRoot

try {
    # ---------------------------------------------------------
    # 1. Backend lint
    # ---------------------------------------------------------
    Write-Host "`n[1/6] Running backend lint..." -ForegroundColor Cyan

    Push-Location (Join-Path $ProjectRoot 'backend')

    try {
        npm run lint

        if ($LASTEXITCODE -ne 0) {
            throw "Backend lint failed (exit code $LASTEXITCODE)."
        }

        Write-Host "PASS: Backend lint" -ForegroundColor Green

        # -----------------------------------------------------
        # 2. Backend unit tests
        # -----------------------------------------------------
        Write-Host "`n[2/6] Running backend unit tests..." -ForegroundColor Cyan

        npm test

        if ($LASTEXITCODE -ne 0) {
            throw "Backend unit tests failed (exit code $LASTEXITCODE)."
        }

        Write-Host "PASS: Backend unit tests" -ForegroundColor Green

        # -----------------------------------------------------
        # 3. Backend integration tests
        # Windows-compatible environment variable handling
        # -----------------------------------------------------
        Write-Host "`n[3/6] Running backend integration tests..." -ForegroundColor Cyan

        # Preserve existing environment values.
        $previousRunDbTests = $env:RUN_DB_TESTS
        $previousDbName = $env:DB_NAME

        try {
            $env:RUN_DB_TESTS = '1'
            $env:DB_NAME = 'pqfms_db'

            # Call Node directly rather than using the Unix-style
            # RUN_DB_TESTS=1 npm script.
            node --test `
                .\tests\integration\final-acceptance.test.js `
                .\tests\integration\smoke.test.js

            $integrationExitCode = $LASTEXITCODE
        }
        finally {
            # Restore the original environment.
            if ($null -eq $previousRunDbTests) {
                Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue
            }
            else {
                $env:RUN_DB_TESTS = $previousRunDbTests
            }

            if ($null -eq $previousDbName) {
                Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue
            }
            else {
                $env:DB_NAME = $previousDbName
            }
        }

        if ($integrationExitCode -ne 0) {
            throw "Backend integration tests failed (exit code $integrationExitCode)."
        }

        Write-Host "PASS: Backend integration tests" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }

    # ---------------------------------------------------------
    # 4. Analytics tests
    # ---------------------------------------------------------
    Write-Host "`n[4/6] Running analytics tests..." -ForegroundColor Cyan

    python -m pytest -q analytics_service/tests

    if ($LASTEXITCODE -ne 0) {
        throw "Analytics tests failed (exit code $LASTEXITCODE)."
    }

    Write-Host "PASS: Analytics tests" -ForegroundColor Green

    # ---------------------------------------------------------
    # 5. Frontend lint and production build
    # ---------------------------------------------------------
    Write-Host "`n[5/6] Running frontend lint and production build..." -ForegroundColor Cyan

    Push-Location (Join-Path $ProjectRoot 'frontend')

    try {
        npm run lint

        if ($LASTEXITCODE -ne 0) {
            throw "Frontend lint failed (exit code $LASTEXITCODE)."
        }

        Write-Host "PASS: Frontend lint" -ForegroundColor Green

        npm run build

        if ($LASTEXITCODE -ne 0) {
            throw "Frontend production build failed (exit code $LASTEXITCODE)."
        }

        Write-Host "PASS: Frontend production build" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }

    # ---------------------------------------------------------
    # 6. Optional load test
    # ---------------------------------------------------------
    if ($IncludeLoadTest) {
        Write-Host "`n[6/6] Running load test..." -ForegroundColor Cyan

        npm run load-test

        if ($LASTEXITCODE -ne 0) {
            throw "Load test failed (exit code $LASTEXITCODE)."
        }

        Write-Host "PASS: Load test" -ForegroundColor Green
    }
    else {
        Write-Host "`n[6/6] Load test skipped." -ForegroundColor Yellow
        Write-Host "To include it, run .\scripts\run-tests.ps1 -IncludeLoadTest"
    }

    # ---------------------------------------------------------
    # Final summary
    # ---------------------------------------------------------
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "ALL EXECUTED VERIFICATION CHECKS PASSED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green

    if (-not $IncludeLoadTest) {
        Write-Host "The load test was not run during this execution." -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}