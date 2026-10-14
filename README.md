# Patient Queue and Flow Management System (PQFMS)

PQFMS is an academic software-development project for the Outpatient Department (OPD) of Robert Mangaliso Sobukwe Hospital (RMSH), Kimberley. It replaces the paper-based outpatient queue with a role-based digital patient-flow workflow.

## Final-release capabilities

- Patient registration with South African ID validation and passport support
- Kiosk self check-in and Reception-assisted check-in
- Daily sequential ticket numbers with duplicate-visit protection
- Four-tier clinical prioritisation and queue ordering
- Privacy-safe public Display Board with real-time refresh
- Deterministic per-tier wait-time estimates with graceful degradation
- Doctor call-to-room, optional SMS notification, consultation notes and discharge
- Patient visit history with Doctor-only consultation notes
- Operational overview and administrator discharge log
- Staff account administration, permissions, deactivation and sign-in history
- Staff shift scheduling with overlap protection
- Server-side authentication, authorisation, rate limiting and input validation
- PostgreSQL-backed integrity constraints and concurrency protection

## Architecture

React + Vite frontend → Express/Node.js REST API → PostgreSQL

The system also contains a small Flask analytics service for wait-time estimation and an optional Twilio SMS integration. Socket.IO is used as a payload-free queue-refresh signal; clients re-fetch authorised data through the API.

## Repository structure

```text
backend/             Express API, services, middleware and automated tests
frontend/            React/Vite client organised by feature
analytics_service/   Flask wait-time estimator and pytest tests
db/                  Versioned PostgreSQL migrations and synthetic seed data
docs/                API and presentation/evidence documentation
scripts/              Windows setup, database and demo utilities
.github/              Continuous-integration workflow
```

## Prerequisites

Node.js (current LTS), npm, Python 3.10+, PostgreSQL 14+ and Chrome or Edge.

## Configuration

Run `scripts\setup.ps1` from PowerShell. It creates the ignored root `.env`, generates local JWT/internal-service secrets when needed, and creates the frontend Vite environment file. Never commit `.env`.

For SMS, set `SMS_ENABLED=true` and provide Twilio credentials. With SMS disabled, the core local workflow remains available.

## Database setup (Windows PowerShell)

```powershell
.\scripts\setup.ps1
.\scripts\database.ps1
```

The migration creates the final schema, constraints, indexes and shift-overlap protection. The seed script uses synthetic patient data and demo staff accounts.

## Run the system

Open three terminals, or use:

```powershell
.\scripts\start-all.ps1
```

Then open `http://localhost:5173`.

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Administrator | `admin_demo` | `DemoPass2026!` |
| Receptionist | `reception_demo` | `DemoPass2026!` |
| Nurse | `nurse_demo` | `DemoPass2026!` |
| Doctor | `doctor_demo` | `DemoPass2026!` |

These accounts are for the academic demonstration only. Do not reuse the password elsewhere.

## Verification

The repository includes unit, integration, security, database-integrity, analytics and performance test infrastructure. Run the automated gates from a clean setup before tagging the final release.

Backend unit tests:

```powershell
npm --prefix backend test
```

Backend lint:

```powershell
npm --prefix backend run lint
```

Analytics tests:

```powershell
python -m pytest -q analytics_service
```

Frontend lint:

```powershell
npm --prefix frontend run lint
```

Frontend build:

```powershell
npm --prefix frontend run build
```

Integration acceptance suite (requires PostgreSQL):

```powershell
npm --prefix backend run test:integration
```

NFR-05 load probe:

```powershell
npm run load-test
```

## API

See `docs/api/openapi.yaml` for the documented REST surface and `docs/api/API.md` for the high-level workflow mapping.

## Security

The project uses server-side role checks, bcrypt password hashes, issuer/audience-bound JWTs, account-state checks on every protected request, rate limiting, parameterised SQL and public-response minimisation. See `SECURITY.md` for the project security boundary and operational guidance.

## Academic boundary

This is an academic prototype using synthetic data. It is not approved or validated for production clinical use and has not been deployed at RMSH. Several capabilities remain deferred as documented in the final report, including appointment scheduling/reminders, pharmacy integration, referrals, full EHR/ICD-10, MFA, offline resilience and multi-site rollout.
