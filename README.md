# Patient Queue and Flow Management System (PQFMS)

PQFMS is an academic software-development project for the Outpatient Department (OPD) of Robert Mangaliso Sobukwe Hospital (RMSH), Kimberley. It replaces the paper-based outpatient queue with a role-based digital patient-flow workflow.

## Final-release capabilities

- Patient registration with South African ID validation and passport support
- Kiosk self check-in and Reception-assisted check-in
- Daily sequential ticket numbers with duplicate-visit protection
- Four-tier clinical prioritisation and queue ordering
- Privacy-safe public Display Board with real-time refresh
- Queue-workload wait-time estimates using priority, active demand, rostered staffing and eligible operational consultation-duration samples; estimate basis, sample counts and unavailable states are exposed rather than presenting a failed estimate as zero
- Doctor call-to-room, optional SMS notification, consultation notes and discharge
- Patient visit history with Doctor-only consultation notes
- Operational overview and administrator discharge log
- Staff account administration, permissions, deactivation and sign-in history
- Staff shift scheduling with overlap protection
- Configurable care pathways, ordered stages and role-controlled journey progress
- Append-only operational event history for queue, pathway, resource and simulation events
- FlowTwin baseline-versus-scenario simulation with repeatable seeds and explicit assumptions
- Synthetic clinic stress testing, captured forecast-versus-observed wait ledger and tier-level delay review
- Clinic resource registry plus idempotent offline resource-status outbox (not a full offline clinical workflow)
- Admin-only synthetic Operational Continuity Lab with repeatable outage scenarios, event reconstruction, duplicate/transition anomaly detection and persisted audit-linked results
- Internal referral tracking and consent-gated operational SMS templates
- Server-side authentication, authorisation, bounded per-IP and per-account login throttling, request limits, secure headers and input validation
- PostgreSQL-backed integrity constraints and concurrency protection

## Architecture

React + Vite frontend → HTTPS reverse proxy → Express/Node.js REST API → PostgreSQL
                                 ↘ Flask/Gunicorn analytics service → PostgreSQL

In local development, the Flask service may run directly for convenience. The production Compose stack places Caddy at the public HTTPS boundary, serves the static frontend with Nginx, keeps API/analytics/database ports private, and runs analytics with Gunicorn. Socket.IO is used as a payload-free queue-refresh signal; clients re-fetch authorised data through the API.

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

The development database script is for a **fresh disposable development database only**: it refuses an existing database and loads synthetic demo fixtures after migrations. For an existing database, do not rerun setup/seeding to update the schema; back it up and use the tracked migration procedure in [the deployment runbook](docs/PRODUCTION_DEPLOYMENT.md). `npm --prefix backend run db:migrate` uses the SHA-256 migration ledger; the explicit baseline option must only be used after verifying the existing schema and backup.

The sorted migration set creates the schema and constraints. Migrations `003_clinic_intelligence.sql` and `004_patient_communications.sql` add Clinic Intelligence modules; migration `006_data_provenance.sql` adds auditable provenance classifications, migration `007_data_provenance_source.sql` records whether each classification came from the server policy, an administrator review, or an outstanding legacy review, and migration `008_backfill_reviewed_provenance_sources.sql` reconciles earlier administrator reviews using the pre-existing reviewer and review timestamp fields. Existing queue records remain `UNCLASSIFIED` until reviewed; their origin is never guessed from names, ticket numbers or symptom text.

New check-ins are classified automatically by the **server-only** `DATA_PROVENANCE_MODE` setting: `OPERATIONAL`, `SYNTHETIC_TEST` or `DEMO`. The safe default is `OPERATIONAL` when `NODE_ENV=production`, and `SYNTHETIC_TEST` otherwise. Production refuses synthetic/demo modes, including any override attempt. Keep synthetic tests in a separate non-production deployment/database. Do not expose this setting to clients. Status, triage and discharge transitions preserve the assigned provenance; every manual correction requires an administrator reason and is written to Flight Recorder. Only visits classified `OPERATIONAL`—automatically by the production server policy or after an authorised administrator review—contribute to historical operational wait/service statistics.

The seed script uses synthetic patient data and demo staff accounts. For an existing local database, take a backup and apply only unapplied migrations `006_data_provenance.sql` and `007_data_provenance_source.sql` as appropriate; do not reset or re-seed a database that contains records you need to keep.

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

The repository includes unit, integration, security, database-integrity, analytics and performance test infrastructure. GitHub Actions validates a fresh PostgreSQL migration run, backend tests, analytics tests, frontend lint/build, production Compose configuration, container image builds and Nginx/Caddy configuration syntax. A passing pipeline does not replace an environment-specific deployment rehearsal or clinical/privacy/security sign-off.

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

## Production deployment

See [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md) for the production Compose design, HTTPS entry point, managed PostgreSQL TLS, migration ledger, one-time administrator bootstrap, health checks and release gates. The Windows `scripts\\start-all.ps1` launcher is for development only; it refuses production mode.

## API

See `docs/api/openapi.yaml` for the documented REST surface and `docs/api/API.md` for the high-level workflow mapping.

## Security

The project uses server-side role checks, bcrypt password hashes, issuer/audience-bound JWTs, account-state checks on protected requests, bounded per-IP/per-account login throttling, parameterised SQL, fail-closed production config validation, TLS requirements for the database and public-response minimisation. The current limiter is process-local; keep one API replica unless a shared rate-limit store is deployed. See `SECURITY.md` and the production runbook for the remaining requirements.

## Academic boundary

This is an academic prototype using synthetic data. It is not approved or validated for production clinical use and has not been deployed at RMSH. The new Referral Relay tracks referrals locally but does not exchange them with another health system. The offline outbox supports resource-status changes only; it does not permit offline patient registration, triage or consultations. The Operational Continuity Lab is currently a synthetic-only benchmark: it does not import paper forms, alter real patient visits or prove the true history of a real clinic session. Access Bridge stores language preferences but currently sends the approved English SMS templates only when Twilio is configured and recorded consent is present. FlowTwin is a planning simulation, not a clinically validated prediction or auto-triage system. Multi-clinic federation and privacy-preserving cross-site benchmarks, full EHR/ICD-10 and pharmacy integration, appointment scheduling/reminders, MFA, reviewed translations, rehearsed disaster recovery and independent production privacy/security assessment remain incomplete. The production Compose files provide a hardened technical deployment path; they do not make the application clinically validated or approved for live patient care. Do not deploy with real patient data until the release blockers in `docs/PRODUCTION_DEPLOYMENT.md` are formally resolved.
