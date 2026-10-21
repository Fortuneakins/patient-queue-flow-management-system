# Patient Queue and Flow Management System (PQFMS)

PQFMS is an academic software-development project for the Outpatient Department (OPD) of Robert Mangaliso Sobukwe Hospital (RMSH), Kimberley. It replaces the paper-based outpatient queue with a role-based digital patient-flow workflow.

## Final-release capabilities

- Patient registration with South African ID validation and passport support
- Kiosk self check-in and Reception-assisted check-in
- Daily sequential ticket numbers with duplicate-visit protection
- Four-tier clinical prioritisation and queue ordering
- Privacy-safe public Display Board with real-time refresh
- Evidence-aware per-tier wait projections using completed-visit timings, explicit sample provenance and low-data fallbacks
- Transparent Clinic Intelligence signals for long waits, sparse history, consultation activity and recorded room capacity
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
- Server-side authentication, authorisation, rate limiting and input validation
- PostgreSQL-backed integrity constraints and concurrency protection

## Architecture

React + Vite frontend → Express/Node.js REST API → PostgreSQL

The system also contains a private Flask analytics service for wait-time estimation and an optional Twilio SMS integration. The browser obtains aggregate predictions through the rate-limited Express API proxy; the Flask predictor requires an internal service token. Socket.IO is used as a payload-free queue-refresh signal; clients re-fetch authorised data through the API.

**Deployment boundary:** this is still an academic prototype, not a clinically validated or hospital-approved service. Review [the deployment-readiness gates](docs/DEPLOYMENT_READINESS.md) before exposing it to real data or users.

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

The browser requests aggregate wait estimates through Express at `/api/analytics/predict`; Express forwards to the private Flask service using `ANALYTICS_URL` and the shared `INTERNAL_SERVICE_TOKEN`. Keep Flask's port private. For a separate analytics container, set `ANALYTICS_URL` to its private service address and bind Flask with `ANALYTICS_HOST=0.0.0.0` only inside that private container network.

## Database setup (Windows PowerShell)

```powershell
.\scripts\setup.ps1
.\scripts\database.ps1
```

The sorted migration set creates the schema and constraints. Migrations `003_clinic_intelligence.sql` and `004_patient_communications.sql` add the optional Clinic Intelligence modules and are applied automatically by `scripts\\database.ps1`. The seed script uses synthetic patient data and demo staff accounts.

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

The repository includes unit, integration, security, database-integrity, analytics and performance test infrastructure. The `feat/clinic-intelligence-platform` branch also adds deterministic simulation unit tests and an integration suite for its new API surfaces. Run the automated gates from a clean setup before tagging a release.

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

This is an academic prototype using synthetic data. It is not approved or validated for production clinical use and has not been deployed at RMSH. The new Referral Relay tracks referrals locally but does not exchange them with another health system. The offline outbox supports resource-status changes only; it does not permit offline patient registration, triage or consultations. The Operational Continuity Lab is currently a synthetic-only benchmark: it does not import paper forms, alter real patient visits or prove the true history of a real clinic session. Access Bridge stores language preferences but currently sends the approved English SMS templates only when Twilio is configured and recorded consent is present. FlowTwin is a planning simulation, not a clinically validated prediction or auto-triage system. Multi-clinic federation and privacy-preserving cross-site benchmarks, full EHR/ICD-10 and pharmacy integration, appointment scheduling/reminders, MFA, reviewed translations, disaster recovery and a production privacy/security assessment remain out of scope.
