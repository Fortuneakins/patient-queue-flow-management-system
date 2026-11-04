# PQFMS final submission handoff — source baseline and evidence boundaries

**Prepared:** 4 November 2026  
**Repository:** https://github.com/Fortuneakins/patient-queue-flow-management-system  
**Assessed branch:** `feat/clinic-intelligence-operations-cockpit`  
**Assessed source commit:** [`4855a7d368d047baa4c3753cced7a6bd5c8ce5fd`](https://github.com/Fortuneakins/patient-queue-flow-management-system/commit/4855a7d368d047baa4c3753cced7a6bd5c8ce5fd)  
**Commit subject:** Auto-reset kiosk ticket confirmation after timeout  
**CI evidence:** GitHub Actions workflow `PQFMS CI`, run [39592355041](https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/39592355041), run number 470, completed with conclusion `success` for the assessed commit.

## 1. Why this handoff exists

The October academic report revision 1.2 pinned an earlier commit on `feat/evidence-driven-intelligence-cockpit`. The project has since advanced. This handoff identifies the later repository state and separates verified source/CI facts from manual acceptance and production-readiness work that has not been demonstrated.

The branch is 271 commits ahead of `main` and 0 commits behind at the time of comparison. This does not mean it has been merged or released. Do not describe it as the main-branch release.

## 2. Source change visible in the pinned commit

The pinned commit changes the kiosk confirmation view to clear the displayed ticket after 60 seconds, with timer cleanup when the component state changes/unmounts. The screen also explains the automatic reset. This is a privacy-oriented display behaviour; it is not evidence that the full patient lifecycle has been manually acceptance-tested.

## 3. Implemented capability boundary

The repository README and implementation modules describe the following assessed capabilities:

- Core OPD workflow: patient registration, kiosk/reception check-in, daily tickets, duplicate active-visit protection, triage, queue display, doctor call-to-room, consultation notes, discharge and visit history.
- Staff administration, server-side role checks, shift scheduling and account lifecycle controls.
- Queue-workload wait estimates with disclosed evidence basis and unavailable states.
- CareGraph ordered pathway tracking and role-controlled stage progress.
- Clinic resource registry and idempotent offline resource-status outbox; this is not offline clinical workflow.
- FlowTwin seeded baseline-versus-scenario simulation and synthetic clinic laboratory.
- Forecast-versus-observed wait review and delay monitoring; these are operational indicators, not clinical validation or automatic triage.
- Append-only operational event history / Flight Recorder.
- Synthetic-only Operational Continuity Lab.
- Internal referral tracking and consent-gated operational SMS templates.
- Data provenance classifications and administrator review.

The intelligence route definitions enforce authentication/password readiness globally and then role-specific access. The route file is `backend/src/routes/intelligence.routes.js`; the implementation services include `intelligenceOverviewService.js`, `carePathwayService.js`, `resourceService.js`, `offlineSyncService.js`, `flowAnalyticsService.js`, `referralService.js`, `contactService.js`, `continuityService.js` and `dataProvenanceService.js`.

## 4. Automated verification — what the current evidence proves

The current pinned commit has a successful GitHub Actions run (run 470). The workflow file `.github/workflows/ci.yml` executes:

- Backend dependency installation, production dependency audit, migration of a fresh PostgreSQL schema, backend lint/unit verification and database-backed integration smoke tests.
- Analytics runtime dependency audit and analytics pytest suite.
- Frontend lint and production build.
- Production Compose syntax and topology checks.
- API, analytics and frontend container image builds.
- Nginx and Caddy configuration validation.

A successful workflow means those configured CI steps completed successfully for this commit. It does **not** prove every test case in the academic report was individually executed, a clean Windows workstation setup was completed, a browser end-to-end acceptance suite passed, or a live clinic deployment was approved.

## 5. Manual acceptance still required for academic demonstration

Record actual results, date, environment, role, test data provenance and evidence file for each test. At minimum:

1. Reception: register a synthetic patient, check in, verify daily ticket and duplicate active-visit rejection.
2. Nurse: assign triage priority and verify queue ordering / CareGraph stage permissions.
3. Doctor: call to room, record consultation notes, discharge and verify history visibility.
4. Public display: verify ticket-only output and ensure names, identifiers and clinical notes are absent.
5. Role boundary: attempt representative prohibited routes with each role and verify server-side rejection.
6. Clinic Intelligence: inspect review prompts, rule/evidence explanation, data provenance state and unavailable/low-sample states.
7. FlowTwin: repeat a fixed-seed scenario and confirm repeatable assumptions/results; verify no automatic queue/triage mutation.
8. Failure paths: analytics unavailable, SMS disabled/failure, invalid stage transition and duplicate resource sync.
9. Kiosk privacy: confirm the ticket confirmation screen resets after 60 seconds and timer is cancelled on unmount/new state.

Do not mark a manual test passed until it is actually run and captured.

## 6. Non-functional requirements requiring measured evidence

The report's prior evidence register identifies NFR-05 load/concurrency, NFR-06 Display Board refresh latency and NFR-10 accessibility score as not fully measured. Keep them open until measurements are captured against this source revision. If the assessment environment does not permit measurement, retain the limitation and do not claim compliance.

## 7. Production-readiness boundary

The repository includes a production Compose scaffold and a detailed runbook. This is deployment packaging, not proof of deployment. The documented open gates include MFA or an approved compensating control, independent clinical/operational validation, privacy/legal review, independent security assessment, representative prospective analytics validation, encrypted backup/restore rehearsal, real infrastructure/TLS/database-grant verification and operational ownership. Do not process real patient data or claim RMSH deployment before these gates are resolved and formally approved.

## 8. Release/report control

- Keep the final academic report pinned to one exact full commit SHA.
- Do not create a final release tag until the selected source commit has completed CI and manual acceptance evidence has been reviewed.
- Do not claim this branch is merged into `main` based solely on ahead/behind comparison.
- Preserve the 22 October test results as historical evidence; do not mix their test totals with later CI run results.
- Update the report's scope diagrams, role claims, test evidence, limitations and rubric crosswalk to match the selected commit.
- The final release checklist remains the authoritative go/no-go checklist: `docs/RELEASE_CHECKLIST.md`.

## 9. Assessor-facing statement

PQFMS is an implemented academic OPD workflow prototype with a modular React/Express/PostgreSQL/Flask architecture and additional operational-planning capabilities. Its current pinned source commit passes the repository's configured CI workflow. The system has not been deployed at Robert Mangaliso Sobukwe Hospital, has not been clinically validated, and is not approved for live patient care. Synthetic simulation, operational review prompts and wait estimates support demonstration/planning only and must not make clinical decisions.
