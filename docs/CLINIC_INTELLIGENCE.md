# Clinic Intelligence — implementation notes

This document describes the optional Clinic Intelligence module on `feat/clinic-intelligence-platform`. It is an academic workflow-planning capability, not a deployed or clinically validated service.

## Getting started

On an existing local PQFMS checkout:

1. Pull the feature branch and install dependencies with `npm ci --prefix backend` and `npm ci --prefix frontend`.
2. For a fresh local database, run the sorted migrations using `scripts\\database.ps1`. For an existing database, take a backup and apply only unapplied migrations 006, 007 and 008; migration 006 adds provenance classifications, migration 007 records the source of each classification, and migration 008 backfills ADMIN_REVIEW only where older rows already have a reviewer ID and review timestamp.
3. Start PQFMS normally with `scripts\\start-all.ps1`.
4. Sign in. Administrators can open **Clinic Intelligence** in the admin sidebar; Nurses and Doctors have CareGraph in their workspace, Doctors have Referral Relay, and Reception has Access Bridge contact preferences.

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

### Operational Continuity Lab

The Continuity Lab is an administrator-only, synthetic prototype intended to explore reconstruction of outpatient event histories after a simulated downtime. It records a scenario seed and outage duration, creates synthetic digital/paper events with separate occurrence and recording minutes, groups events into synthetic visit timelines, and flags duplicate source references, cross-source semantic duplicates, invalid transitions and per-visit recording-order discrepancies. Repeated scenarios are deterministic for the same input. Results and engine version are persisted in `continuity_runs`, and run creation is recorded in Flight Recorder within the same database transaction.

The current increment is intentionally not a real paper-ingestion or offline clinical workflow. It does not read or change patient/queue records, upload scans, match real identities, modify source records or claim to prove what happened during an actual RMSH outage. Invalid events do not advance the reconstructed state; uncertain cases are labelled for review. The transition model is an operational test fixture, not a clinical protocol or triage mechanism.

See [Operational Continuity Lab design and verification](CONTINUITY_LAB_DESIGN.md) for requirement IDs, business rules, implementation details and acceptance evidence.

### Prediction truth and safety review

A forecast capture stores per-tier estimates against the current waiting-visit snapshot. Once a tracked visit has a first-call timestamp, the ledger compares the elapsed time from forecast capture until first call with the captured per-tier estimate. It reports overall mean absolute error across all observed samples and separately reports the sample count and mean absolute error for observations completed within the configured forecast horizon. Samples whose observed time exceeds the horizon remain included in the overall diagnostic metric and are counted separately; they are not silently discarded or represented as in-horizon accuracy.

The review panel also displays tracked and observed sample counts, the forecast horizon, queue-to-first-call wait among completed visits by tier, and currently waiting visits past an operational threshold. An observation outside the forecast horizon can reflect a very long wait, stale test data or changed operating conditions and warrants contextual review.

These are operational monitoring indicators. They cannot prove the model is clinically accurate, unbiased or fair; low sample counts and patient complexity must be considered. The module must not automatically change clinical priority.

### Queue data provenance

Migrations 006 and 007 add an explicit provenance classification and its source for queue visits. Classification values are `UNCLASSIFIED`, `OPERATIONAL`, `SYNTHETIC_TEST` and `DEMO`; source values are `LEGACY_REVIEW_REQUIRED`, `SERVER_POLICY` and `ADMIN_REVIEW`. Existing records default to `UNCLASSIFIED` and `LEGACY_REVIEW_REQUIRED`; migration 008 marks a pre-existing source as `ADMIN_REVIEW` only when both the old reviewer ID and review timestamp prove that a manual review occurred. Its origin is never guessed from names, ticket numbers or symptom text. New check-ins receive their classification automatically from the server-only `DATA_PROVENANCE_MODE` setting: production defaults to `OPERATIONAL`, non-production defaults to `SYNTHETIC_TEST`. Only `OPERATIONAL`, `SYNTHETIC_TEST` and `DEMO` are allowed configuration values. Production rejects synthetic/demo modes unconditionally; demonstrations must use an isolated non-production environment. The API exposes the effective policy in the admin provenance workspace. An administrator can review historical queue metadata, select a classification and provide a reason. The API records each manual change in the append-only Flight Recorder. Patient names, identification numbers and symptom descriptions are not exposed in the provenance list.

Historical mean/P90 queue-to-call statistics and service-duration samples use records classified as `OPERATIONAL` by the server policy at check-in or by authorised administrator review. Unclassified completed visits are counted separately and do not contribute to those historical summaries. Records labelled `SYNTHETIC_TEST` or `DEMO` are excluded from operational queue displays and analytics, while remaining in the underlying history and audit trail. Active visits cannot be relabelled as synthetic/demo; they must be completed through the normal workflow first. Classification does not modify status, triage priority, clinical notes or historical timestamps. Routine status, triage and discharge transitions preserve the system-assigned provenance. An explicit administrator correction is the only normal application workflow that changes provenance after check-in; its reason, previous/new classification, actor and source are audited. The configured mode affects visibility of test/demo fixtures in the queue workspace: operational mode hides synthetic and demo visits, while a non-production synthetic/demo mode keeps the ordinary operational/legacy queue visible and only hides the other test-data class. This prevents development configuration from silently hiding operational or legacy records.

Forecast Truth retains an all-sample error for auditability, but separately reports operational, unclassified and excluded test/demo observations, including which class exceeded the declared horizon. The overall audit metric can still reflect stale or test observations, so it must not be presented as operational accuracy without checking the provenance breakdown. FlowTwin uses the configured queue visibility snapshot for current demand; historical service-time calibration remains limited to operational records. The public estimator estimates work ahead of a hypothetical visit by tier using active queue demand, the rostered doctor count and the median of recent operational consultation durations when at least five valid samples exist. With fewer observations it reports a named baseline assumption; if work is active with no rostered doctors it reports the estimate as unavailable, not zero.

### Explainable Clinic Intelligence rules

The server-side `clinic-insight-rules-1.0.0` engine generates prioritised operational review prompts from the aggregate snapshot. Current rules cover active queue with no rostered doctors, waits exceeding the operational delay-review threshold, Limited/Unavailable resources, unresolved record provenance, and insufficient service-time evidence. Every prompt includes a stable rule ID, severity, observed evidence and a proposed human action. Outputs are deterministic operational signals, not diagnoses or triage recommendations; no insight changes patient priority or queue state. A “no prompt” result is explicitly not a safety clearance.

### Explainable clinic review prompts

The Clinic Intelligence overview builds a server-side `clinic-insight-rules-1.0.0` snapshot. Rules currently check for active queue work with no rostered doctor, visits crossing the 60-minute delay-review threshold, resource records marked Limited/Unavailable, unresolved provenance and insufficient service-time history. The response includes a stable rule ID, severity, summary, source evidence, a recommended human review action and the appropriate workbench. If no threshold triggers, it returns an explicit informational item rather than implying a safety clearance.

These are deterministic operating heuristics—not a trained clinical model. They do not read symptom free text, diagnose, create priority levels, modify live queue records, contact patients or claim a patient's clinical acuity. They are only as accurate as the source systems: the roster is not necessarily the same as actual staff availability, a resource status may be stale, and the 60-minute threshold is a configurable operational review heuristic rather than a clinical standard. Staff must verify the prompt's evidence in the live workflow before acting.

The landing page renders evidence returned by the API rather than independently inventing a second set of review rules in the browser. The overview also returns aggregate provenance counts, rostered doctors, resource-review counts and service-history sample counts, and labels the versions of both the queue estimator and the insight rules.

### Live wait estimate methodology

The separate Flask estimator uses currently visible active visits filtered by the server-configured provenance mode. In operational mode, synthetic and demo visits are excluded. Historical service durations are calculated only from discharged records explicitly classified as `OPERATIONAL`, with a valid positive interval between first consultation call and discharge, bounded to 1–240 minutes and the most recent 90 days (up to 500 records).

When at least five eligible durations exist, the median is used as the typical service-time basis; the response reports the actual sample count. Under five observations it uses a documented 12-minute baseline assumption. The wait estimate for each hypothetical tier includes waiting visits with a tier equal or more urgent than the target, plus an assumed half-service-time workload allowance for each active consultation. The total workload is divided by the reported rostered doctor count and multiplied by a 1.15 planning buffer, then rounded upward. This is more transparent than fixed per-tier constants but remains a simplified workload estimate: it does not know the true remaining consultation duration, interruptions, walk-ins not yet checked in or all real-world capacity constraints.

If active work exists but the shift service reports zero rostered doctors, the estimator returns an unavailable/degraded state rather than zero wait. If the database or staffing dependency fails, estimates are marked unavailable with a generic message; internal error details are logged server-side. The public display board shows the evidence basis/sample count and explicitly labels unavailable estimates. The estimate is not individualised, is not a guarantee, and does not control triage or who gets called.

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
| Queue data provenance | `GET /data-provenance/queue-records`, `PATCH /data-provenance/queue-records/:queue_id` | Admin |
| Referrals | `GET /referrals` | Nurse, Doctor, Admin |
| Create/update referrals | `POST /referrals`, `PATCH /referrals/:referral_id` | Doctor, Admin |
| Contact preferences | `GET /contact-preferences/:patient_id` | Reception, Nurse, Doctor, Admin |
| Record consent/send operational SMS | `PUT /contact-preferences/:patient_id`, `POST /contact-preferences/:patient_id/send-update` | Reception, Admin |

## Validation

The branch includes:
- Explainable insight-rule tests for staffing/queue risk, provenance uncertainty, evidence sufficiency and deterministic severity ordering.
- Login limiter tests for per-IP/per-account throttling, expiry and bounded memory.
- Analytics API tests for provenance filtering, readiness, estimate quality and honest unavailability.
- Pure-function simulation tests for validation, repeatability, zero capacity and synthetic-batch outputs.
- Continuity-engine unit tests for determinism, duplicate detection, invalid transitions, delayed recording and constrained synthetic-only scope.
- Continuity API integration tests for role enforcement, input validation, persisted results and Flight Recorder linkage.
- Database-backed integration coverage for role boundaries, default journey assignment, ordered stage progress, resource status idempotency, simulation persistence, forecast/fairness queries, referral state transitions and consent-gated communications.
- The existing backend, analytics and frontend checks in GitHub Actions.

The feature is not considered verified until those checks complete successfully on the branch. External SMS requires credentials and can incur provider charges; the automated suite deliberately disables sending.
