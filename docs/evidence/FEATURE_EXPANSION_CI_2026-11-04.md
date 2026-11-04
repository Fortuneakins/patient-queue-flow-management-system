# PQFMS feature-expansion CI evidence — 4 November 2026

## Source identity

- Repository: https://github.com/Fortuneakins/patient-queue-flow-management-system
- Branch: feat/clinic-intelligence-operations-cockpit
- Tested code commit: e5816637196697e5d73171cb355b51bc9bf7e47d
- Commit subject: fix: cast action status parameter in update query
- Workflow: PQFMS CI
- Successful run: https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/41855479856 (run 763)
- Second successful run for the same commit: https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/41855467114 (run 762)
- Conclusion: success for both observed runs.

## Feature scope represented by the tested source

1. Operational Pressure Analysis: aggregate queue-age bands, rostered doctor/nurse/reception counts, room-capacity evidence and a transparent, versioned rule-based 0–100 planning heuristic.
2. New review rules for doctor workload ratio (CAPACITY-002), backlog concentration (FLOW-002) and no recorded available room capacity (RESOURCE-002).
3. Operational Action Register: persistent evidence snapshot, active-action de-duplication, active-staff assignment, server-enforced status transitions and Flight Recorder events.
4. Existing queue/CareGraph lifecycle integrity and triage-before-consultation guard remain in the feature-branch source.

## Results visible in run 763

- Backend unit tests: 62 passed, 0 failed.
- Database-backed integration tests: 26 passed, 0 failed.
- Analytics tests: 32 passed.
- Backend dependency audit and fresh-schema migration checks: completed successfully.
- Frontend production dependency audit, lint and build: completed successfully.
- Production Compose validation, API/analytics/frontend container builds, Nginx configuration and Caddy HTTPS configuration: completed successfully.

## Verification boundary

These are automated CI results for the pinned source commit only. They do not establish completion of the project owner's manual browser workflow, responsive/keyboard acceptance of the new panels, real-hospital roster/resource data accuracy, forecast validation on representative operational data, NFR-05/NFR-06/NFR-10 measurements, clinical approval or production deployment. The Operational Pressure Index is a planning heuristic, not a clinically calibrated measure. The Action Register records administrative follow-up; it does not change triage priority, allocate clinicians or mutate patient queue state.
