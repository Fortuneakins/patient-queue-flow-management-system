# Clinic Intelligence — implementation notes

This document describes the optional Clinic Intelligence module on `feat/clinic-intelligence-platform`. It is an academic workflow-planning capability, not a deployed or clinically validated service.

## Getting started

On an existing local PQFMS checkout:

1. Pull the feature branch and install dependencies with `npm ci --prefix backend` and `npm ci --prefix frontend`.
2. Run the sorted database migrations using `scripts\\database.ps1`. The script applies migrations in filename order. Migration 003 creates the event log, pathway graph, resource registry, simulation/forecast tables, referral records, contact preferences and the constrained offline-sync receipt table. Migration 004 adds communication-delivery attempt records.
3. Start PQFMS normally with `scripts\\start-all.ps1`.
4. Sign in as an administrator and open **Clinic Intelligence** in the administrator sidebar.

Do not run the SQL migrations against a production database without a backup and review.

## Modules

### FlowTwin

Compare a current queue/staffing snapshot with a hypothetical scenario including additional arrivals, additional or unavailable stations, doctor delay and a time horizon. Each run has a recorded model version, seed, inputs, baseline, result and assumptions. When available, completed consultation durations inform the simulation; the service reports the number of observations used. It uses bounded synthetic service durations if there is insufficient history.

Output is descriptive planning support. It does not allocate staff, alter a patient's tier, predict a diagnosis or trigger operational action automatically.

### CareGraph

Every new check-in is assigned the configured `OPD_STANDARD` pathway. The pathway initially marks registration complete, triage ready and later stages pending. Administrators can create additional ordered pathways; authorised staff can inspect and update assigned stage progress. Stage transitions are role-checked, and required earlier stages must be completed before later stages start.

CareGraph is a process tracker, not a clinical protocol editor. The configured demo stages must be reviewed for the local clinic workflow before use.

### Resource continuity

The resource registry tracks rooms, equipment, services and supplies using `AVAILABLE`, `LIMITED` or `UNAVAILABLE` states and a capacity field. Administrators can queue resource-status changes locally during a network outage. Each queued update has a UUID idempotency key and staff-account owner; the server records a receipt so a repeated sync does not re-apply a different change under the same key.

The outbox is local browser storage and covers resource statuses only. It is not a general offline clinical mode, has no cross-device queue, and should not be treated as a durable backup. Staff must sign in as the account that created pending changes before synchronising them.

### Prediction truth and safety review

A forecast capture stores per-tier estimates against the current waiting-visit snapshot. Once a visit has a first-call timestamp, the ledger compares elapsed queue-to-call time with its captured tier estimate and reports mean absolute error. The review panel also displays sample sizes, completed-visit elapsed time by tier, and currently waiting visits past an operational threshold.

These are operational monitoring indicators. They cannot prove the model is clinically accurate, unbiased or fair; low sample counts and patient complexity must be considered. The module must not automatically change clinical priority.

### Flight Recorder

Important queue actions and new-module actions append compact event records. The database rejects direct UPDATE and DELETE statements on this event table. Metadata deliberately excludes free-text symptoms, consultation-note contents and contact numbers. An append-only table is not a substitute for backup, retention rules, privileged database controls or a formal audit policy.

### Referral Relay

Creates a local referral record, validates the patient/visit relationship and enforces an explicit state machine for acknowledgement, work in progress, completion and cancellation. It does not transmit referral data to another clinic or an external EHR; external interoperability requires a separately authenticated, consented and standards-reviewed connector.

### Access Bridge

Stores a patient's preferred language/channel and an explicit contact-consent record. Operational SMS attempts require a recorded SMS consent, are logged, and are limited to a wait estimate or a generic service-delay notification. Messages must not include diagnosis, symptoms, triage tier or consultation notes. Twilio sends only when enabled and configured. The current implementation uses English templates only; saving a local-language preference does not mean that reviewed translations exist. Voice calls and WhatsApp delivery are not implemented.

## API surface

The new API is mounted at `/api/intelligence`. All endpoints require a valid bearer token and a password-ready account, plus the listed role below.

| Capability | Routes | Access |
|---|---|---|
| Overview, event log | `GET /overview`, `GET /events` | Admin |
| Active queue, pathways | `GET /active-visits`, `GET /pathways`, `GET /journeys/:queue_id` | Nurse, Doctor, Admin (journey view also permits Reception) |
| Create and assign pathways | `POST /pathways`, `POST /journeys/:queue_id/assign` | Admin |
| Update journey stage | `PATCH /journeys/:queue_id/stages/:stage_id` | Reception, Nurse, Doctor, Admin; stage role still enforced |
| Resources and offline sync | `GET /resources` | Nurse, Doctor, Admin |
| Resource changes and offline sync | `POST /resources`, `PUT /resources/:resource_id/status`, `POST /offline-sync` | Admin |
| Scenarios and synthetic lab | `POST /simulations`, `GET /simulations`, `GET /benchmarks`, `POST /synthetic-lab/run` | Admin |
| Forecast truth and delay review | `POST /forecasts`, `GET /forecasts/truth`, `GET /fairness` | Admin |
| Referrals | `GET /referrals` | Nurse, Doctor, Admin |
| Create/update referrals | `POST /referrals`, `PATCH /referrals/:referral_id` | Doctor, Admin |
| Contact preferences | `GET /contact-preferences/:patient_id` | Reception, Nurse, Doctor, Admin |
| Record consent/send operational SMS | `PUT /contact-preferences/:patient_id`, `POST /contact-preferences/:patient_id/send-update` | Reception, Admin |

## Validation

The branch includes:
- Pure-function simulation tests for validation, repeatability, zero capacity and synthetic-batch outputs.
- Database-backed integration coverage for role boundaries, default journey assignment, ordered stage progress, resource status idempotency, simulation persistence, forecast/fairness queries, referral state transitions and consent-gated communications.
- The existing backend, analytics and frontend checks in GitHub Actions.

The feature is not considered verified until those checks complete successfully on the branch. External SMS requires credentials and can incur provider charges; the automated suite deliberately disables sending.
