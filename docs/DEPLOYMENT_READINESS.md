# PQFMS deployment-readiness gate

> **Status: not approved for real clinical deployment.** PQFMS remains an academic workflow prototype until the engineering, security, privacy, clinical-governance and operational gates below have been evidenced and signed off. A successful build is necessary, but it is not hospital approval or clinical validation.

## Intended service topology

- **Browser → HTTPS reverse proxy → Express API.** The browser calls the public API for queue operations and `GET /api/analytics/predict`. Socket.IO carries a refresh signal; authorised queue data is re-fetched through the API.
- **Express API → PostgreSQL** over a private network. The database port must not be open to the public internet.
- **Express API → Flask analytics** over the private `ANALYTICS_URL` address, authenticated with `X-Internal-Service-Token`. The public-facing browser must not call Flask directly.
- **Flask analytics → Express shift endpoint** for a live roster count, using the same internal service token. `GET /api/shifts/on-duty` is an internal service-to-service route, not a browser route.

In a single-host local installation, `ANALYTICS_URL=http://localhost:5001` and the Flask default bind address `127.0.0.1` are suitable. If Flask runs in a separate container, set `ANALYTICS_URL` to the private service DNS name and `ANALYTICS_HOST=0.0.0.0` inside that container only; do not publish port 5001 to the internet. Keep PostgreSQL similarly private. Apply network policy so that only the API and analytics service can reach the database.

## Required configuration

- Generate a unique, high-entropy `JWT_SECRET` and `INTERNAL_SERVICE_TOKEN` for every environment. Both the Node API and Flask analytics process need the matching internal token. Do not commit `.env`, copy production secrets into development, or put internal tokens in Vite variables.
- Set `NODE_ENV=production`, a production-only database account with least privilege, and the exact approved frontend origin in `CORS_ORIGIN`. Do not use wildcard browser origins for authenticated APIs.
- Set `ANALYTICS_URL` to a private server-side URL. `ANALYTICS_HOST` controls the Flask bind interface; a container's `0.0.0.0` binding is acceptable only when network controls prevent public access.
- Set `VITE_API_BASE_URL` and `VITE_SOCKET_URL` to the HTTPS public API origin at frontend build time. The client no longer needs `VITE_ANALYTICS_BASE_URL`; keep analytics hostnames and service tokens server-side.
- `STAFFED_STATIONS` is a degraded-mode fallback, not proof of actual staffing. The live prediction response and admin panel disclose when a roster count could not be verified.

## Release procedure

1. Review the code and migration diffs against a known-good backup. Run the complete CI pipeline for the exact commit to be released; do not merge with failed or missing checks.
2. Build from lockfiles with `npm ci` for backend/frontend and install the pinned Python dependencies. Do not deploy from a developer working directory.
3. Back up PostgreSQL and verify that restoration works to a separate database. Review and apply migrations in order during an approved change window. Do **not** run the synthetic demo seed against a production database.
4. Configure TLS, request/body size limits, reverse-proxy timeouts, rate limits, secure secret storage, non-root process identities, log retention, log redaction, database connection limits and an alerting/incident-response process.
5. Remove or disable demo users and synthetic records before any real-data pilot. Create named staff accounts, enforce credential changes, confirm role boundaries, and review audit/event retention. Use production patient data only after authorisation and privacy controls are approved.
6. Perform end-to-end checks for kiosk registration, duplicate-visit prevention, triage updates, call-to-room, consultation notes, discharge timestamps, patient history permissions, roster lookup, queue display refresh, SMS consent/delivery and safe analytics degradation.
7. Complete security, privacy, clinical and operational acceptance with the responsible institution. Include a privacy impact assessment and POPIA review where applicable; a threat model and independent security assessment; backup/restore and disaster-recovery rehearsal; accessibility, load and concurrency testing; and written workflow/triage sign-off.

## Clinic Intelligence limitations that must be addressed before any pilot

The wait predictor is an evidence-aware queue simulation, **not a trained clinical AI model**. It uses the current PQFMS queue, completed-visit timings in a rolling 90-day window and reported/configured service slots. It does not anticipate future arrivals, diagnose patients, validate triage priority or guarantee an individual wait. At least eight valid completed consultation durations are required for pooled timing; a tier needs eight of its own samples for a tier-specific median. Until there is enough history, the model explicitly reports the default 12-minute service-time assumption. These sample thresholds do not establish statistical calibration or clinical validity.

The rule-based operational signals flag configured review conditions such as long waits, missing room-registry evidence or limited timing history. They are prompts for authorised staff, not automatic decisions. A clear signal panel is not an all-clear assurance. Resource records must be kept current and thresholds must be reviewed against the actual clinic's approved workflow.

Before a real-world pilot, collect prospective shadow-mode forecasts, compare predictions with observed call times, analyse error by tier and time period, document missing-data rates and staffing changes, predefine acceptance thresholds, and obtain clinical/operational approval. Keep a manual workflow available, make rollback immediate, and do not use predictions to change clinical priority without a separately approved governance process.

## Go/no-go checklist

- [ ] CI is green on the exact candidate commit, including backend lint/unit/integration, analytics tests, frontend lint and production build.
- [ ] Secret rotation, HTTPS, private network boundaries, least-privilege database access and rate limiting are verified.
- [ ] Production seed data and demo accounts are absent; migrations and backup restoration are tested.
- [ ] Role-specific access tests and an independent security review are complete.
- [ ] POPIA/privacy, retention, consent, audit and incident-response decisions are approved by the institution.
- [ ] Clinical workflow/triage sign-off, prospective model evaluation, accessibility and load/concurrency results are accepted in writing.
- [ ] Named operational owner, monitoring, support, rollback and disaster-recovery procedures are in place.

Until every relevant item is evidenced and approved, deploy only to isolated development/demo environments using synthetic data.
