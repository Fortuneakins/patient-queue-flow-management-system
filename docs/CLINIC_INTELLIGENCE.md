# Clinic Intelligence — implementation notes

This document describes the optional Clinic Intelligence module on `feat/clinic-intelligence-platform`. It is an academic workflow-planning capability, not a deployed or clinically validated service.

## Getting started

On an existing local PQFMS checkout:

1. Pull the feature branch and install dependencies with `npm ci --prefix backend` and `npm ci --prefix frontend`.
2. For a fresh local database, run the sorted migrations using `scripts\\database.ps1`. For an existing database, take a backup and apply only unapplied migrations 006 through 009; migrations 006–008 add and reconcile provenance classifications, while migration 009 creates the Operational Action Register table and indexes.
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

The `DELAY_REVIEW_THRESHOLD_MINUTES` setting controls the operational delay-review prompt and dashboard counter only. It defaults to 60 minutes and accepts whole values from 1 to 1440; it never sets or changes a clinical triage tier.

The current increment is intentionally not a real paper-ingestion or offline clinical workflow. It does not read or change patient/queue records, upload scans, match real identities, modify source records or claim to prove what happened during an actual RMSH outage. Invalid events do not advance the reconstructed state; uncertain cases are labelled for review. The transition model is an operational test fixture, not a clinical protocol or triage mechanism.

See [Operational Continuity Lab design and verification](CONTINUITY_LAB_DESIGN.md) for requirement IDs, business rules, implementation details and acceptance evidence.

### Prediction truth and safety review

A forecast capture stores per-tier estimates against the current waiting-visit snapshot. Once a tracked visit has a first-call timestamp, the ledger compares the elapsed time from forecast capture until first call with the captured per-tier estimate. It reports overall mean absolute error across all observed samples and separately reports the sample count and mean absolute error for observations completed within the configured forecast horizon. Samples whose observed time exceeds the horizon remain included in the overall diagnostic metric and are counted separately; they are not silently discarded or represented as in-horizon accuracy.

The review panel also displays tracked and observed sample counts, the forecast horizon, queue-to-first-call wait among completed visits by tier, and currently waiting visits past an operational threshold. An observation outside the forecast horizon can reflect a very long wait, stale test data or changed operating conditions and warrants contextual review.

These are operational monitoring indicators. They cannot prove the model is clinically accurate, unbiased or fair; low sample counts and patient complexity must be considered. The module must not automatically change clinical priority.

### Queue data provenance

Migrations 006 and 007 add an explicit provenance classification and its source for queue visits. Classification values are `UNCLASSIFIED`, `OPERATIONAL`, `SYNTHETIC_TEST` and `DEMO`; source values are `LEGACY_REVIEW_REQUIRED`, `SERVER_POLICY` and `ADMIN_REVIEW`. Existing records default to `UNCLASSIFIED` and `LEGACY_REVIEW_REQUIRED`; migration 008 marks a pre-existing source as `ADMIN_REVIEW` only when both the old reviewer ID and review timestamp prove that a manual review occurred. Its origin is never guessed from names, ticket numbers or symptom text. New check-ins receive their classification automatically from the server-only `DATA_PROVENANCE_MODE` setting: production defaults to `OPERATIONAL`, non-production defaults to `SYNTHETIC_TEST`. `SERVER_POLICY` identifies the deployment policy that assigned the label; it does **not** authenticate the patient's identity or prove independently that a particular row is a real visit. In production, the configuration assumes every check-in is operational, so synthetic acceptance tests must run in an isolated non-production environment/database. Do not infer authenticity from a person's name, ticket number or clinical text. Only `OPERATIONAL`, `SYNTHETIC_TEST` and `DEMO` are allowed configuration values. Production rejects synthetic/demo modes unconditionally; demonstrations must use an isolated non-production environment. The API exposes the effective policy in the admin provenance workspace. An administrator can review historical queue metadata, select a classification and provide a reason. The API records each manual change in the append-only Flight Recorder. Patient names, identification numbers and symptom descriptions are not exposed in the provenance list.

Historical mean/P90 queue-to-call statistics and service-duration samples use records classified as `OPERATIONAL` by the server policy at check-in or by authorised administrator review. Unclassified completed visits are counted separately and do not contribute to those historical summaries. Records labelled `SYNTHETIC_TEST` or `DEMO` are excluded from operational queue displays and analytics, while remaining in the underlying history and audit trail. Active visits cannot be relabelled as synthetic/demo; they must be completed through the normal workflow first. Classification does not modify status, triage priority, clinical notes or historical timestamps. Routine status, triage and discharge transitions preserve the system-assigned provenance. An explicit administrator correction is the only normal application workflow that changes provenance after check-in; its reason, previous/new classification, actor and source are audited. The configured mode affects visibility of test/demo fixtures in the queue workspace: operational mode hides synthetic and demo visits, while a non-production synthetic/demo mode keeps the ordinary operational/legacy queue visible and only hides the other test-data class. This prevents development configuration from silently hiding operational or legacy records.

Forecast Truth retains an all-sample error for auditability, but separately reports operational, unclassified and excluded test/demo observations, including which class exceeded the declared horizon. The overall audit metric can still reflect stale or test observations, so it must not be presented as operational accuracy without checking the provenance breakdown. FlowTwin uses the configured queue visibility snapshot for current demand; historical service-time calibration remains limited to operational records. The public estimator estimates workload ahead of a hypothetical visit by tier using active queue demand, the rostered doctor count and the median elapsed interval from doctor call to recorded discharge when at least five eligible operational samples exist. This interval can include post-consultation tasks and discharge delays, so it is only a service-time proxy, not a measure of pure face-to-face consultation duration. With fewer observations it reports a named baseline assumption; if work is active with no rostered doctors it reports the estimate as unavailable, not zero.

### Explainable Clinic Intelligence rules

The server-side `clinic-insight-rules-1.1.0` engine generates prioritised operational review prompts from the aggregate snapshot. Current rules are `CAPACITY-001` (active queue without a rostered doctor), `CAPACITY-002` (six or more waiting visits per rostered doctor), `FLOW-001` (waits beyond `DELAY_REVIEW_THRESHOLD_MINUTES`, default 60 minutes and validated to 1–1440 minutes), `FLOW-002` (at least three overdue visits representing at least half the waiting queue), `RESOURCE-001` (Limited/Unavailable resources), `RESOURCE-002` (no recorded available room capacity while visits wait), `DATA-001` (unresolved visit provenance) and `MODEL-001` (fewer than five eligible operational service-duration samples). Every prompt includes a stable rule ID, severity, observed evidence and a proposed human action. Outputs are deterministic operational signals, not diagnoses or triage recommendations; no insight changes patient priority or queue state. A “no prompt” result is explicitly not a safety clearance. The dashboard also auto-refreshes its API-backed snapshot every 30 seconds, with manual refresh available and failed sources identified separately from legitimate zero values.

### Operational Pressure Analysis

The administrator overview calculates a versioned aggregate pressure snapshot from the currently visible waiting queue, configured delay-review threshold, active rostered shifts and administrator-maintained room registry. It exposes fixed queue-age buckets (under 15, 15–29, 30–59 and 60+ minutes), waiting visits per rostered doctor, on-duty nurse/reception counts and available/limited room-capacity units. Age buckets are descriptive counts and do not change triage priority.

The `clinic-operations-pressure-1.0.0` heuristic has a maximum of 100 points: waiting load contributes up to 35 points (normalised against six waiting visits per rostered doctor), the share of waiting visits beyond the configured delay-review threshold contributes up to 35, active work with no rostered doctor contributes 20, and a configured room register with no available capacity contributes 10. The dashboard displays each component and its evidence. If queue counts are unavailable, the score is unavailable rather than zero. A missing room registry is reported as not configured and is not interpreted as zero capacity.

Additional rule prompts identify high waiting-to-doctor ratios (`CAPACITY-002`), concentrated overdue backlogs (`FLOW-002`) and zero recorded available room capacity (`RESOURCE-002`). These are review prompts, not clinical algorithms. A roster entry or resource status can be stale, so the responsible coordinator must verify current conditions before acting. The index and thresholds are not calibrated against outcomes and must not be represented as clinically validated or used to assign triage priority.

### Operational Action Register

Migration 009 creates `clinic_action_items`. An administrator can convert a rule from the latest server-generated overview into a tracked action. The server stores the rule ID, severity, title, summary, recommendation and evidence snapshot; it does not accept arbitrary client-authored alert evidence. A partial unique index prevents more than one active (`OPEN`, `ACKNOWLEDGED` or `IN_PROGRESS`) action for the same rule. Once an action is resolved or dismissed, a later occurrence can create a new action.

Each action can be assigned to an active staff account and progresses through the server-enforced state machine: `OPEN` to `ACKNOWLEDGED`, `IN_PROGRESS` or `DISMISSED`; `ACKNOWLEDGED` to `IN_PROGRESS`, `RESOLVED` or `DISMISSED`; `IN_PROGRESS` to `RESOLVED` or `DISMISSED`. Resolved and dismissed actions are closed. Creation and updates append `OPERATIONAL_ACTION_CREATED` and `OPERATIONAL_ACTION_UPDATED` events to Flight Recorder. The register is administrator-only. It records operational follow-up; it does not contact patients, assign clinicians, change queue order or modify triage.

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
| Pressure analysis and action register | `GET /overview` (pressure fields), `GET /actions`, `POST /actions/from-insight`, `PATCH /actions/:action_id` | Admin |
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
- Explainable insight-rule tests for staffing/queue risk, provenance uncertainty, evidence sufficiency, backlog concentration, room constraints and deterministic severity ordering.
- Operational pressure unit tests for weighted score calculation, queue/roster/room evidence and unavailable states.
- Database-backed action-register tests for role boundaries, rule-to-action conversion, active-action deduplication, assignment, state transitions and Flight Recorder linkage.
- Login limiter tests for per-IP/per-account throttling, expiry and bounded memory.
- Analytics API tests for provenance filtering, readiness, estimate quality and honest unavailability.
- Pure-function simulation tests for validation, repeatability, zero capacity and synthetic-batch outputs.
- Continuity-engine unit tests for determinism, duplicate detection, invalid transitions, delayed recording and constrained synthetic-only scope.
- Continuity API integration tests for role enforcement, input validation, persisted results and Flight Recorder linkage.
- Database-backed integration coverage for role boundaries, default journey assignment, ordered stage progress, resource status idempotency, simulation persistence, forecast/fairness queries, referral state transitions and consent-gated communications.
- The existing backend, analytics and frontend checks in GitHub Actions.

The feature is not considered verified until those checks complete successfully on the branch. External SMS requires credentials and can incur provider charges; the automated suite deliberately disables sending.
