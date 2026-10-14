# PQFMS Final Release Checklist

Use this checklist immediately before creating the GitHub release that is referenced by the academic report.

## Release identity

- [ ] Confirm the final repository URL.
- [ ] Run `git status` and confirm only intended source/documentation changes are present.
- [ ] Create the final release commit.
- [ ] Create and record the exact release tag (for example `v1.0.0-final`).
- [ ] Record the full commit SHA in the academic report and Appendix A.

## Security

- [ ] Confirm no `.env` file is tracked.
- [ ] Confirm no API keys, database passwords or JWT secrets are committed.
- [ ] Rotate any credential that was ever present in an untrusted copy of the project.
- [ ] Confirm `JWT_SECRET` is generated locally and is at least 32 characters.
- [ ] Confirm `INTERNAL_SERVICE_TOKEN` is configured for the analytics-to-API integration.
- [ ] Keep Twilio disabled unless real SMS testing is required.

## Reproducibility

- [ ] Run `.\scripts\setup.ps1` from a fresh clone.
- [ ] Run `.\scripts\database.ps1`.
- [ ] Confirm migrations apply from an empty database.
- [ ] Confirm synthetic seed data loads.
- [ ] Start all services with `.\scripts\start-all.ps1`.
- [ ] Confirm `GET /api/health/ready` reports database readiness.

## Automated quality gates

- [ ] `npm --prefix backend run lint`
- [ ] `npm --prefix backend test`
- [ ] `npm --prefix backend run test:integration`
- [ ] `python -m pytest -q analytics_service/tests`
- [ ] `npm --prefix frontend run lint`
- [ ] `npm --prefix frontend run build`
- [ ] `npm run load-test` using the NFR-05 configuration.

## Manual acceptance

- [ ] Kiosk check-in.
- [ ] Sequential daily ticket.
- [ ] Duplicate active visit handling.
- [ ] Triage tier assignment and queue ordering.
- [ ] Public Display Board privacy boundary.
- [ ] Doctor call-to-room.
- [ ] SMS success/failure handling.
- [ ] Consultation notes and immutability after discharge.
- [ ] Discharge and history.
- [ ] Role/route restrictions.
- [ ] Account deactivation revokes access immediately.
- [ ] Staff directory permission behaviour.
- [ ] Shift overlap rejection.
- [ ] Analytics degradation state.
- [ ] Five-minute idle sign-out.

## Evidence

- [ ] Capture final screenshots for SCR-01, SCR-02, SCR-03, SCR-05, SCR-06, SCR-07, SCR-08, SCR-09, SCR-10, SCR-11, SCR-12, SCR-13, SCR-15 and SCR-16.
- [ ] Export the final test run and performance measurements to `docs/evidence/`.
- [ ] Complete Actual Result and Status for every test listed in the academic report.
- [ ] Complete the five success-criterion outcomes in Section 9 of the report.
- [ ] Ensure the report's screenshots, test totals, measured values, release tag and commit SHA all refer to the same release.
