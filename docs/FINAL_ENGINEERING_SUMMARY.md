# PQFMS Final Engineering Summary

## What was upgraded

The source snapshot was refactored into a reproducible, modular software project aligned with the final academic report.

### Security and privacy

- Removed the original local `.env` from the deliverable.
- Removed hard-coded fallback JWT secrets.
- Enforced a minimum 32-character JWT secret at backend startup.
- Added issuer/audience-bound JWTs.
- Added active-account checks on every protected request.
- Implemented server-side role and permission checks.
- Kept permission claims bound to the sign-in token so permission changes take effect at the next sign-in, while account deactivation remains immediate.
- Restricted CORS to configured frontend origins.
- Added rate limiting to kiosk verification/check-in and login attempts.
- Minimized public patient responses.
- Separated public queue data from staff queue data.

### Data integrity

- Added versioned PostgreSQL migrations.
- Added synthetic seed data.
- Added daily atomic ticket counters and unique daily ticket constraints.
- Added partial unique index for one active visit per patient.
- Added database CHECK constraints for status, tier, role, identification type and other domain values.
- Added conditional state-transition updates for concurrency safety.
- Added separate triage/call/discharge attribution fields and timestamps.
- Added database-backed shift overlap protection.
- Added indexes for queue, history, staff and sign-in queries.

### Application architecture

- Split the monolithic backend into configuration, database, middleware, routes, services and validation modules.
- Split the monolithic frontend into feature-level React components, shared components, hooks and API services.
- Kept the Flask analytics service as a separate, read-only calculation component.
- Kept Socket.IO payload-free; clients re-fetch authorised data through the API.
- Isolated Twilio failures from the clinical workflow.

### Testing and quality

- Added backend unit/security/validation tests.
- Added a PostgreSQL-backed final acceptance suite covering registration, duplicate check-in, role boundaries, triage, concurrency, lifecycle transitions, history visibility, shifts, deactivation and permission semantics.
- Added analytics pytest coverage.
- Added a dependency-free NFR-05 load test using Node's built-in fetch API.
- Added CI for database-backed integration tests, backend lint/tests, analytics tests, frontend lint and frontend build.
- Added release verification and evidence checklists.

### Reproducibility and presentation

- Added PowerShell setup, database, reset, test and start scripts.
- Setup scripts generate local development secrets rather than requiring secrets to be committed.
- Added a professional root README, security guidance, API documentation and OpenAPI description.
- Added a presentation runbook and demo reset procedure.
- Removed unused Vite/React starter assets.
- Added project-specific browser title and favicon.
- Added accessible form-label association for the reusable `Field` component.
- Added Nurse and Administrator patient-history access to match the report's FR-04.3 scope.

## Verification note

The preparation environment successfully verified backend lint/unit tests and analytics tests. The PostgreSQL integration suite and frontend production build require a clean Windows development environment with PostgreSQL and freshly installed dependencies; the supplied CI workflow is configured to run them on a clean Linux runner. Do not treat a test as passed in the academic report until the result has been observed on the final release.

## Credential hygiene warning

The original uploaded archive contained a local `.env` with credentials. That file is not included in this final package. Any real credentials that appeared in the original archive should be rotated before the project is pushed to a public or shared GitHub repository.
