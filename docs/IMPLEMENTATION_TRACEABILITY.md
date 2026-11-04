# PQFMS Implementation Traceability

This document is a practical engineering companion to the final academic report. It records where the main requirements and non-functional controls are implemented in the submitted source tree.

| Area | Report IDs | Implementation |
|---|---|---|
| Patient registration | FR-01.1–FR-01.5, BR-15 | `backend/src/services/patientService.js`, `backend/src/utils/validation.js`, `backend/src/routes/patient.routes.js`, `db/migrations/001_schema.sql` |
| Kiosk check-in | FR-02.1–FR-02.4, BR-01–BR-02, BR-09 | `backend/src/routes/queue.routes.js`, `backend/src/services/queueService.js`, `backend/src/services/ticketService.js`, PostgreSQL partial unique index and ticket counter |
| Public queue | FR-02.5, FR-12.1–FR-12.2, BR-09, BR-16 | `backend/src/services/queueService.js`, `analytics_service/`, Socket.IO event in `backend/src/app.js` |
| Queue ordering | FR-02.6, BR-03 | `backend/src/services/queueService.js` |
| Triage | FR-03.1–FR-03.2, BR-05, BR-17 | `backend/src/routes/queue.routes.js`, `backend/src/services/queueService.js`; priority is persisted with actor/time attribution and is required before doctor call |
| Call / consultation / discharge | FR-02.7–FR-02.8, FR-04.1–FR-04.3, BR-04, BR-06–BR-08, BR-17 | `backend/src/services/queueService.js`, `backend/src/services/smsService.js`; state transitions are transactionally recorded and a waiting visit must have a triage priority before it can be called |
| Authentication | FR-09.1, BR-11 | `backend/src/services/authService.js`, `backend/src/middleware/authenticate.js` |
| Server-side authorisation | FR-09.2, BR-12–BR-13 | `backend/src/middleware/authenticate.js`, protected route definitions |
| Account lifecycle | FR-09.3–FR-09.8, BR-10–BR-13 | `backend/src/services/authService.js`, `backend/src/routes/auth.routes.js`, `backend/src/routes/staff.routes.js`, `db/migrations/001_schema.sql` |
| Idle session handling | FR-09.9 | `frontend/src/hooks/usePQFMS.js` |
| Shifts / staffing | FR-11.1–FR-11.2, BR-14 | `backend/src/services/shiftService.js`, `db/migrations/001_schema.sql` |
| Wait-time estimation | FR-12.1–FR-12.2, BR-16 | `analytics_service/estimator.py`, `analytics_service/app.py` |
| Rate limiting | NFR-04 | `backend/src/utils/rateLimit.js`, login and kiosk route configuration |
| Privacy-safe public API | NFR-03, BR-09 | `backend/src/routes/patient.routes.js`, `backend/src/services/queueService.js` |
| Credentials and secrets | NFR-02 | `backend/src/config/env.js`, `.env.example`, `.gitignore` |
| Data integrity | NFR-08, BR-01–BR-05, BR-12, BR-14–BR-15 | `db/migrations/001_schema.sql`, `backend/src/services/queueService.js`, `ticketService.js`, `shiftService.js` |
| Performance | NFR-05–NFR-06 | queue indexes in `db/migrations/001_schema.sql`, Socket.IO refresh signal, load-test location reserved under `tests/load/` when added |
| Fault tolerance | NFR-07, BR-08 | `backend/src/services/smsService.js`, `analytics_service/app.py`, UI degraded-state handling |
| Reproducibility | NFR-12 | `db/migrations/`, `db/seed/`, `scripts/setup.ps1`, root and service lock/dependency files |
| Synthetic continuity recovery | FR-CONT-01–FR-CONT-05; NFR-CONT-01–NFR-CONT-03; BR-CONT-01–BR-CONT-03 | `frontend/src/features/admin/intelligence/ContinuityLabPanel.jsx`, `backend/src/routes/intelligence.routes.js`, `backend/src/services/continuityService.js`, `backend/src/utils/continuityEngine.js`, `db/migrations/005_continuity_runs.sql`, `backend/tests/unit/continuityEngine.test.js`, `backend/tests/integration/continuity.test.js`; detailed specification in `docs/CONTINUITY_LAB_DESIGN.md` |
| Repository quality | NFR-11 | ESLint configs, modular `frontend/src/` and `backend/src/` structure, CI workflow |

## Release integrity rule

The final GitHub release must be tagged only after the final test run is complete. The academic report should then record the exact tag and commit SHA used for assessment. No credentials, local `.env` files, `node_modules`, caches or generated build artefacts belong in source control.

## Clinic Intelligence implementation traceability (source inspected at 5aa61fa)

| Capability | API / access boundary | Service / implementation | Data and evidence boundary |
|---|---|---|---|
| Intelligence overview and operational event review | `GET /api/intelligence/overview`, `GET /events`; ADMIN | `intelligenceOverviewService.js`, `clinicInsightEngine.js`, `operationalEventService.js` | Aggregate review prompts include stable rule IDs, severity, evidence and suggested human action. Deterministic rules; not a generative/diagnostic AI. |
| CareGraph pathways | `GET /pathways`, `POST /pathways`, `GET /journeys/:queue_id`, `POST /journeys/:queue_id/assign`, `PATCH /journeys/:queue_id/stages/:stage_id`; clinical/care-team roles with stage-role enforcement | `carePathwayService.js`, `backend/src/routes/intelligence.routes.js` | `care_pathways`, `care_pathway_stages`, `queue_pathway_progress`; ordered progression and role checks. Operational process tracking, not clinical protocol. |

| Queue-triggered standard pathway synchronisation | Core queue triage, call and discharge routes; doctor call requires a non-null priority | `backend/src/services/queueService.js` — `updateStandardPathway()`; `frontend/src/features/shared/QueueList.jsx` disables the call action until triage is assigned | Only `OPD_STANDARD` is auto-synchronised. Triage completes the triage stage; call starts consultation; discharge completes consultation and discharge. Queue and stage updates share a transaction; row locks and predecessor checks protect progression. Custom pathways remain staff-managed. Operational workflow integrity only. |
| Resource registry and status | `GET /resources`; clinical roles. Create/update routes ADMIN | `resourceService.js` | `clinic_resources`; status values AVAILABLE/LIMITED/UNAVAILABLE. Recorded status must be confirmed by responsible staff. |
| Offline resource-status synchronisation | `POST /offline-sync`; ADMIN | `offlineSyncService.js` | `offline_sync_receipts`; UUID idempotency for resource status only. Not offline patient registration, triage or consultation. |
| FlowTwin and synthetic lab | `POST/GET /simulations`, `GET /benchmarks`, `POST /synthetic-lab/run`; ADMIN | `flowAnalyticsService.js`, `backend/src/utils/flowSimulation.js` | `flow_simulations`; model version, seed, inputs, outputs and assumptions persisted. Simulation does not mutate clinical priority or automatically allocate staff. |
| Forecast truth and delay review | `POST /forecasts`, `GET /forecasts/truth`, `GET /fairness`; ADMIN | `flowAnalyticsService.js`, `clinicInsightEngine.js` | `flow_forecasts`, `flow_forecast_samples`; operational diagnostics only, not proof of clinical accuracy/fairness. |
| Data provenance | `GET /data-provenance/queue-records`, `PATCH /data-provenance/queue-records/:queue_id`; ADMIN | `dataProvenanceService.js`, `backend/src/config/dataProvenancePolicy.js` | Migrations 006–008; UNCLASSIFIED/OPERATIONAL/SYNTHETIC_TEST/DEMO and source metadata. Server policy is not identity/authenticity verification. |
| Internal referrals | `GET /referrals`; clinical roles. Create/update ADMIN/DOCTOR | `referralService.js` | `care_referrals`; local tracking only, no external health-system exchange. |
| Contact preferences / Access Bridge | Read: ADMIN/RECEPTION/NURSE/DOCTOR; update/send: ADMIN/RECEPTION, send additionally rate-limited | `contactService.js`, `backend/src/routes/intelligence.routes.js` | `patient_contact_preferences`; consent-gated SMS templates, English templates only; no voice/WhatsApp delivery. |
| Synthetic Operational Continuity Lab | `POST /continuity/run`, `GET /continuity/runs`; ADMIN | `continuityService.js`, `backend/src/utils/continuityEngine.js` | `continuity_runs` and append-only operational events; synthetic benchmark only, not real paper-form ingestion/recovery. |
| Kiosk ticket confirmation privacy reset | Kiosk browser workflow | `frontend/src/features/kiosk/KioskView.jsx` | Commit `4855a7d368d047baa4c3753cced7a6bd5c8ce5fd` starts a 60-second reset timer while a ticket is shown and cleans it up when the ticket state changes/unmounts. This is a UI privacy behaviour, not an end-to-end acceptance result. |

### Source and verification boundary

The rows above are source mappings, not a declaration that every route/role combination has been manually exercised. The intelligence router applies authentication and password readiness globally, then role-specific middleware per route. The current CI run for source commit `5aa61fa554450f0c82e9d89950e762608dcf5258` is workflow run `41846303445` (run 746), conclusion `success`. It reports 58/58 backend unit tests and 25/25 database-backed integration tests passing; it also completes dependency audits, analytics tests, frontend lint/build, production container builds and reverse-proxy configuration validation. Consult [the final submission handoff](FINAL_SUBMISSION_HANDOFF.md) for the CI scope, manual acceptance list and production-readiness boundary. Keep NFR-05, NFR-06 and NFR-10 unverified until measured evidence is retained. CI does not replace the user's pending browser-based end-to-end workflow and role-matrix acceptance.
