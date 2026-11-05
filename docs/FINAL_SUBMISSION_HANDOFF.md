# PQFMS final submission handoff — workflow integration and evidence boundaries

**Prepared:** 4 November 2026  
**Repository:** https://github.com/Fortuneakins/patient-queue-flow-management-system  
**Assessed branch:** `feat/clinic-intelligence-operations-cockpit`  
**Assessed code commit:** [`e5816637196697e5d73171cb355b51bc9bf7e47d`](https://github.com/Fortuneakins/patient-queue-flow-management-system/commit/e5816637196697e5d73171cb355b51bc9bf7e47d)  
**Commit subject:** fix: cast action status parameter in update query  
**CI evidence:** GitHub Actions workflow `PQFMS CI`, run [41855479856](https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/41855479856), run number 763, completed with conclusion **success** for the assessed code commit. Run 762 (41855467114) also completed successfully for the same source SHA.

## 1. Purpose and source boundary

This handoff supersedes the earlier source pin to commit `4855a7d` for the Revision 1.4 code baseline. It records the workflow-integrity changes made after the 4 November kiosk privacy-reset revision. Earlier October test results and screenshots remain historical evidence for the source revision to which they were originally attached. Do not combine historical local totals, current CI totals and unperformed manual acceptance checks into one unsupported claim.

The assessed source is the feature branch stated above. No final release tag, merge to `main`, hosted RMSH deployment, clinical validation or hospital acceptance is claimed.

## 2. Implementation changes in the assessed source

### 2.1 Queue lifecycle and CareGraph integration

The backend now synchronises the default `OPD_STANDARD` CareGraph pathway with the authoritative queue lifecycle:

1. A newly checked-in visit receives a completed registration stage and a ready triage stage.
2. A nurse triage priority update completes the triage stage and makes the next required consultation stage ready.
3. A doctor call moves the consultation stage to in progress.
4. A successful discharge completes consultation and discharge pathway stages.

The synchronisation runs within the same PostgreSQL transaction as the queue transition. The helper uses row-level locking and required-predecessor checks. It records pathway transition events with `triggered_by: QUEUE_LIFECYCLE`. Completion is idempotent: a stage already completed through the CareGraph workspace is not rewritten or re-audited as a new completion, but the next eligible required stage can still be promoted. The automatic synchronisation applies only to the seeded `OPD_STANDARD` pathway. Custom pathways remain staff-managed.

This is operational process tracking. It does not prescribe clinical protocols, decide urgency, diagnose patients or replace a clinician's judgement.

### 2.2 Triage-before-consultation guard

A waiting visit cannot be called to a doctor until a triage priority has been assigned. The API enforces this condition and returns HTTP 409 for an untriaged call. The Doctor queue interface also disables the call action and explains that triage is awaited. The server-side guard remains authoritative; hiding or disabling a button is not treated as a security control.

### 2.3 Dependency audit remediation

The backend lockfile was updated to patched transitive runtime packages after the CI production audit identified advisories affecting `body-parser`, `follow-redirects` and `qs`. The audit command remains enabled; it was not skipped or relaxed. The successful latest CI run confirms the configured backend production dependency audit passes for this source commit.

## 3. Automated tests added or strengthened

The database-backed acceptance suite now verifies:

- Initial standard pathway state after check-in.
- Triage completion and consultation readiness after nurse priority assignment.
- HTTP 409 when a doctor attempts to call a waiting visit without a triage priority.
- Consultation stage transition to `IN_PROGRESS` on doctor call.
- Completion of consultation and discharge stages when queue discharge succeeds.
- The final pathway state remains complete when a CareGraph stage has already been completed through the stage-management interface.
- Existing concurrency handling, note immutability, role restrictions and workflow provenance assertions remain in the integration suites.

## 4. CI verification record

The expanded assessed code commit `e5816637196697e5d73171cb355b51bc9bf7e47d` completed [PQFMS CI run 763](https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/41855479856) with conclusion **success**. A second run for the same commit, [run 762](https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/41855467114), also completed successfully. Earlier runs 746–761 are historical or failed intermediate expansion attempts and are not the evidence baseline for this revision.

The configured workflow covers:

- Backend installation and production dependency audit.
- Fresh PostgreSQL schema migration with the checksum-tracked migration ledger.
- Backend lint and unit tests.
- Database-backed backend integration tests.
- Analytics runtime dependency audit and pytest suite.
- Frontend dependency audit, lint and production build.
- Production Compose syntax/topology validation.
- API, analytics and frontend container image builds.
- Nginx and Caddy configuration validation.

The run-763 log reports **62/62 backend unit tests passing**, **26/26 database-backed integration tests passing**, and **32 analytics tests passing**. Frontend dependency audit, lint and production build, backend/analytics dependency audits, fresh migration validation, production Compose checks, API/analytics/frontend image builds and Nginx/Caddy configuration checks also completed successfully. These are separate suite summaries; they are not a count of all manual test cases or a claim that browser-based user acceptance has been performed.

## 5. Manual acceptance remains open

The project owner has not yet performed the full workflow, full role-matrix checks or a complete demonstration rehearsal. These remain required before the submission can be described as manually accepted. Record the actual environment, role, synthetic test data, expected result, observed result, status and evidence file.

1. Reception: register a synthetic patient, perform kiosk or assisted check-in, verify ticket numbering and duplicate active-visit handling.
2. Nurse: assign a priority, confirm queue ordering, verify the CareGraph triage stage and confirm stage-role enforcement.
3. Doctor: confirm that an untriaged visit cannot be called; call a triaged visit, enter notes, discharge, and verify final queue/history/pathway state.
4. Role matrix: test representative allowed and prohibited actions for Reception, Nurse, Doctor and Administrator, including backend API boundaries.
5. Public display and kiosk: verify ticket-only display privacy and the 60-second kiosk confirmation reset.
6. Clinic Intelligence and FlowTwin: inspect evidence/low-sample states, fixed-seed repeatability and the boundary that simulations do not mutate clinical queue priority.
7. Operational Pressure Analysis: reconcile queue-age bands to the waiting queue, independently recompute the visible pressure components, check roster/resource records against the test setup and verify unavailable inputs remain unavailable.
8. Operational Action Register: create an action from a current prompt, test duplicate conversion, assign/unassign active staff, exercise each allowed status transition, verify closed actions cannot reopen and inspect Flight Recorder evidence.
9. Responsive and keyboard acceptance for the new pressure and action-register panels.
7. Failure conditions: test analytics unavailability, SMS disabled/failure, repeated actions, invalid stage transitions and duplicate resource-sync replay.

Do not mark these manual cases as passed based solely on a related automated integration assertion.

## 6. Non-functional measurements still open

- **NFR-05:** load/concurrency and p95 response-time evidence remains to be measured and retained.
- **NFR-06:** Display Board refresh latency remains to be measured with timestamped observations.
- **NFR-10:** accessibility remains to be assessed with keyboard/focus and suitable automated checks.
- Forecast accuracy remains unvalidated against a representative prospective operational dataset. Synthetic data must not be described as operational performance validation.

## 7. Production-readiness and clinical governance boundary

The repository includes production-oriented packaging and CI image/configuration checks. Those checks do not prove a hosted deployment. Before any real-clinic use, the documented open gates include MFA or an approved compensating control, independent security assessment, privacy/legal review, clinical and operational approval, representative analytics validation, encrypted backup/restore rehearsal, environment-specific TLS/database configuration and clear operational ownership. Do not enter real patient data or claim RMSH deployment without the responsible organisation's approval.

## 8. Release/report control

- Pin the final academic report to the exact tested source commit `e5816637196697e5d73171cb355b51bc9bf7e47d`; later documentation-only commits must be identified separately.
- List any later documentation-only commits separately from the assessed code commit.
- Do not create a final release tag until the manual acceptance evidence appropriate to the assessment has been completed and reviewed.
- Do not claim this feature branch is merged into `main`.
- Preserve the 22 October test results as historical; do not mix them with the November CI results.
- Use `docs/RELEASE_CHECKLIST.md` as the go/no-go checklist and `docs/IMPLEMENTATION_TRACEABILITY.md` as the source map.

## 9. Assessor-facing statement

PQFMS is an implemented academic outpatient queue and flow prototype with a React/Vite frontend, Express/Node.js API, PostgreSQL system of record and separate Flask analytics service. The assessed code source passes the repository's configured CI workflow, including backend unit/integration suites, analytics checks, frontend build and production packaging/configuration checks. The default queue lifecycle is integrated with CareGraph progression, and the API prevents a doctor call before a triage priority is assigned. Clinic Intelligence also includes transparent aggregate Operational Pressure Analysis and a persistent, administrator-controlled Operational Action Register with audit events. Full manual browser acceptance by the project owner remains pending. PQFMS has not been deployed at Robert Mangaliso Sobukwe Hospital, has not been clinically validated and is not approved for live patient care.
