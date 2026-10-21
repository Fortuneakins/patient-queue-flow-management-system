# Clinic Intelligence — implementation notes

This document describes the optional Clinic Intelligence module on `feat/clinic-intelligence-platform`. It is an academic workflow-planning capability, not a deployed or clinically validated service.

## Getting started

On an existing local PQFMS checkout:

1. Pull the feature branch and install dependencies with `npm ci --prefix backend` and `npm ci --prefix frontend`.
2. Run the sorted database migrations using `scripts\\database.ps1`. The script applies migrations in filename order. Migration 003 creates the event log, pathway graph, resource registry, simulation/forecast tables, referral records, contact preferences and the constrained offline-sync receipt table. Migration 004 adds communication-delivery attempt records.
3. Start PQFMS normally with `scripts\\start-all.ps1`.
4. Sign in. Administrators can open **Clinic Intelligence** in the admin sidebar; Nurses and Doctors have CareGraph in their workspace, Doctors have Referral Relay, and Reception has Access Bridge contact preferences.

Do not run the SQL migrations against a production database without a backup and review.

## Modules

### FlowTwin

Compare a current queue/staffing snapshot with a hypothetical scenario including additional arrivals, additional or unavailable stations, doctor delay and a time horizon. Each run has a recorded model version, seed, inputs, baseline, result and assumptions. When available, completed consultation durations inform the simulation; the service reports the number of observations used. It uses bounded synthetic service durations if there is insufficient history.

Output is descriptive planning support. It does not allocate staff, alter a patient's tier, predict a diagnosis or trigger operational action automatically.

### Live wait estimator and evidence quality

The Flask analytics service's `GET /api/predict` endpoint reads the currently active queue and de-identified timing observations from completed visits in the preceding 90 days. It does not select names, identity numbers, symptoms or consultation notes. The predictor schedules the current waiting workload by PQFMS priority tier and arrival time, using the median completed consultation duration for that tier when at least eight valid tier observations are available. When the tier sample is smaller, it uses a pooled clinic median if at least eight valid service observations exist; otherwise it explicitly reports a 12-minute fallback assumption. Ongoing consultations use observed service-duration residuals when adequate data exist, with a cautious documented fallback for missing timestamps or sparse evidence.

The response preserves the four numeric tier fields for existing clients and adds a model version, sample counts, the evidence source for each tier, historical queue-to-first-call medians and interpretation warnings. These metadata distinguish observed timing from assumptions; they do not constitute a statistically validated confidence interval. Predictions describe the queue currently recorded in PQFMS and do not anticipate future arrivals. They do not diagnose, triage, alter clinician-assigned priority or guarantee an individual patient's wait.

The Prediction Truth Ledger remains the empirical evaluation mechanism. Staff can capture forecasts, then inspect error only after corresponding visits reach an observed first consultation call. Operational use should remain supervised until the system accumulates representative data and has completed prospective validation. Synthetic seed records and test scenarios must not be represented as actual hospital evidence.

### CareGraph

Every new check-in is assigned the configured `OPD_STANDARD` pathway. The pathway initially marks registration complete, triage ready and later stages pending. Administrators can create additional ordered pathways; authorised staff can inspect and update assigned stage progress. Stage transitions are role-checked, and required earlier stages must be completed before later stages start.

CareGraph is a process tracker, not a clinical protocol editor. The configured demo stages must be reviewed for the local clinic workflow before use.

### Resource continuity

The resource registry tracks rooms, equipment, services and supplies using `AVAILABLE`, `LIMITED` or `UNAVAILABLE` states and a capacity field. Administrators can queue resource-status changes locally during a network outage. Each queued update has a UUID idempotency key and staff-account owner; the server records a receipt so a repeated sync does not re-apply a different change under the same key.

The outbox is local browser storage and covers resource statuses only. It is not a general offline clinical mode, has no cross-device queue, and should not be treated as a durable backup. Staff must sign in as the account that created pending changes before synchronising them.

### Operational Continuity Lab

The Continuity Lab is an administrator-only, synthetic prototype intended to explore reconstruction of outpatient event histories after a simulated downtime. It records a scenario seed and outage duration, creates synthetic digital/paper events with separate occurrence and recording minutes, groups events into synthetic visit timelines, and flags duplicate source references, cross-source semantic duplicates, invalid transitions and per-visit recording-order discrepancies. Repeated scenarios are deterministic for the same input. Results and engine version are persisted in `continuity_runs`, and run creation is recorded in Flight Recorder within the same database transaction.

The current increment is intentionally not a real paper-ingestion or offline clinical workflow. It does not read or change patient/queue records, upload scans, match real identities, modify source records or claim to prove what happened during an actual RMSH outage. Invalid events do not advance the reconstructed state; uncertain cases are labelled for review. The transition model is an operational test fixture, not a clinical protocol or triage mechanism.

See [Operational Continuity Lab design and verification](CONTINUITY_LAB_DESIGN.md) for requirement IDs, business rules, implementation details and acceptance evidence.

### Prediction truth and safety review

A forecast capture stores per-tier estimates against the current waiting-visit snapshot. Once a visit has a first-call timestamp, the ledger compares the remaining time from forecast capture until first call with the captured per-tier estimate and reports mean absolute error. The review panel also displays sample sizes, queue-to-first-call wait among completed visits by tier, and currently waiting visits past an operational threshold.

These are operational monitoring indicators. They cannot prove the model is clinically accurate, unbiased or fair; low sample counts and patient complexity must be considered. The module must not automatically change clinical priority.

### Flight Recorder

Important queue actions and new-module actions append compact event records. The database rejects direct UPDATE and DELETE statements on this event table. Metadata deliberately excludes free-text symptoms, consultation-note contents and contact numbers. An append-only table is not a substitute for backup, retention rules, privileged database controls or a formal audit policy.

### Referral Relay

Creates a local referral record, validates the patient/visit relationship and enforces an explicit state machine for acknowledgement, work in progress, completion and cancellation. It does not transmit referral data to another clinic or an external EHR; external interoperability requires a separately authenticated, consented and standards-reviewed connector.

### Access Bridge

Stores a patient's preferred language/channel and an explicit contact-consent record. Operational SMS attempts require a recorded SMS consent, are logged, and are limited to a wait estimate or a generic service-delay notification. Messages must not include diagnosis, symptoms, triage tier or consultation notes. Twilio sends only when enabled and configured. The send endpoint is throttled to five attempts per staff account per minute, and a successful send triggers a two-minute patient-level cooldown before another operational SMS can be sent. The current implementation uses English templates only; saving a local-language preference does not mean that reviewed translations exist. Voice calls and WhatsApp delivery are not implemented.

## API surface

The new API is mounted at `/api/intelligence`. All endpoints require a valid bearer token and a password-ready account, plus the listed role below. The UI exposes a subset of these routes in role-appropriate workspaces; the server remains the authority for all permissions.

| Capability | Routes | Access |
|---|---|---|
| Overview, event log | `GET /overview`, `GET /events` | Admin |
| Active queue, pathways | `GET /active-visits`, `GET /pathways`, `GET /journeys/:queue_id` | Nurse, Doctor, Admin (journey view also permits Reception) |
| Create and assign pathways | `POST /pathways`, `POST /journeys/:queue_id/assign` | Admin |
| Update journey stage | `PATCH /journeys/:queue_id/stages/:stage_id` | Reception, Nurse, Doctor, Admin; stage role still enforced |
| Resources and offline sync | `GET /resources` | Nurse, Doctor, Admin |
| Resource changes and offline sync | `POST /resources`, `PUT /resources/:resource_id/status`, `POST /offline-sync` | Admin |
| Scenarios and synthetic lab | `POST /simulations`, `GET /simulations`, `GET /benchmarks`, `POST /synthetic-lab/run` | Admin |
| Synthetic continuity recovery and run history | `POST /continuity/run`, `GET /continuity/runs` | Admin |
| Forecast truth and delay review | `POST /forecasts`, `GET /forecasts/truth`, `GET /fairness` | Admin |
| Referrals | `GET /referrals` | Nurse, Doctor, Admin |
| Create/update referrals | `POST /referrals`, `PATCH /referrals/:referral_id` | Doctor, Admin |
| Contact preferences | `GET /contact-preferences/:patient_id` | Reception, Nurse, Doctor, Admin |
| Record consent/send operational SMS | `PUT /contact-preferences/:patient_id`, `POST /contact-preferences/:patient_id/send-update` | Reception, Admin |

## Validation

The branch includes:
- Pure-function simulation tests for validation, repeatability, zero capacity and synthetic-batch outputs.
- Continuity-engine unit tests for determinism, duplicate detection, invalid transitions, delayed recording and constrained synthetic-only scope.
- Continuity API integration tests for role enforcement, input validation, persisted results and Flight Recorder linkage.
- Database-backed integration coverage for role boundaries, default journey assignment, ordered stage progress, resource status idempotency, simulation persistence, forecast/fairness queries, referral state transitions and consent-gated communications.
- The existing backend, analytics and frontend checks in GitHub Actions.

The feature is not considered verified until those checks complete successfully on the branch. External SMS requires credentials and can incur provider charges; the automated suite deliberately disables sending.
