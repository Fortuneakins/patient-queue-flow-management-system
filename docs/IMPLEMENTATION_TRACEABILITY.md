# PQFMS Implementation Traceability

This document is a practical engineering companion to the final academic report. It records where the main requirements and non-functional controls are implemented in the submitted source tree.

| Area | Report IDs | Implementation |
|---|---|---|
| Patient registration | FR-01.1–FR-01.5, BR-15 | `backend/src/services/patientService.js`, `backend/src/utils/validation.js`, `backend/src/routes/patient.routes.js`, `db/migrations/001_schema.sql` |
| Kiosk check-in | FR-02.1–FR-02.4, BR-01–BR-02, BR-09 | `backend/src/routes/queue.routes.js`, `backend/src/services/queueService.js`, `backend/src/services/ticketService.js`, PostgreSQL partial unique index and ticket counter |
| Public queue | FR-02.5, FR-12.1–FR-12.2, BR-09, BR-16 | `backend/src/services/queueService.js`, `analytics_service/`, Socket.IO event in `backend/src/app.js` |
| Queue ordering | FR-02.6, BR-03 | `backend/src/services/queueService.js` |
| Triage | FR-03.1–FR-03.2, BR-05, BR-17 | `backend/src/routes/queue.routes.js`, `backend/src/services/queueService.js` |
| Call / consultation / discharge | FR-02.7–FR-02.8, FR-04.1–FR-04.3, BR-04, BR-06–BR-08, BR-17 | `backend/src/services/queueService.js`, `backend/src/services/smsService.js` |
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
