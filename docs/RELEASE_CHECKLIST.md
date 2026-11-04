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
- [ ] Confirm `INTERNAL_SERVICE_TOKEN` is a unique secret distinct from `JWT_SECRET`.
- [ ] Confirm production uses `DATA_PROVENANCE_MODE=OPERATIONAL`; synthetic/demo overrides are prohibited.
- [ ] Confirm PostgreSQL TLS is enabled and verified, and production origins are HTTPS.
- [ ] Confirm seeded demo accounts are absent and the first administrator was provisioned through the audited one-time bootstrap utility.
- [ ] Confirm only the HTTPS gateway exposes host ports; API, analytics and PostgreSQL are private.
- [ ] Confirm Twilio remains disabled unless consent, credentials, delivery testing and operating procedures are approved.
- [ ] Confirm MFA or a formally documented accepted compensating control is approved before real-clinic use.

## Reproducibility

- [ ] Run `.\scripts\setup.ps1` from a fresh clone.
- [ ] For a fresh development database, run `.\scripts\database.ps1`; this must never run in production.
- [ ] Verify `pqfms_schema_migrations` contains filenames and checksums for the applied migration set.
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
- [ ] Validate `compose.production.yml` with `docker compose --env-file .env.production -f compose.production.yml config --quiet`.
- [ ] Build the API, analytics and frontend container images.
- [ ] Inspect container health checks and run a staging smoke test through the HTTPS entry point.
- [ ] Verify API and analytics ports are not publicly exposed.

## Production-only operational gates

- [ ] Validate TLS, DNS, security headers, origin policy and reverse-proxy IP handling in the real deployment environment.
- [ ] Perform an independent security assessment/penetration test and privacy/legal review.
- [ ] Demonstrate encrypted backups and complete a restore rehearsal to a separate database.
- [ ] Record approved recovery-point and recovery-time objectives, monitoring/alerting and incident ownership.
- [ ] Obtain clinician/operations sign-off for queue workflow, prioritisation semantics, accessibility, patient-facing wording and downtime procedures.
- [ ] Validate prediction error on representative independently captured operational data, with sample sizes, uncertainty and drift monitoring; synthetic data must not count as operational evidence.
- [ ] Record written approval from the responsible organisation before entering real patient data.

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


## Final academic source freeze — 4 November 2026 (Revision 1.4 baseline)

- [ ] Confirm the assessed code commit is `5aa61fa554450f0c82e9d89950e762608dcf5258` on `feat/clinic-intelligence-operations-cockpit`; do not identify the branch as merged to `main`.
- [x] Retain [PQFMS CI run 746 (41846303445)](https://github.com/Fortuneakins/patient-queue-flow-management-system/actions/runs/41846303445) as the successful automated verification record for the assessed code commit.
- [x] Confirm backend production dependency audit passes after updating the vulnerable transitive `body-parser`, `follow-redirects` and `qs` packages in `backend/package-lock.json`.
- [x] Confirm CI reports 58/58 backend unit tests and 25/25 database-backed integration tests passing for this code revision.
- [x] Confirm the standard `OPD_STANDARD` CareGraph stages follow triage, consultation and discharge transitions from the queue lifecycle; verify idempotent completion and the untriaged-call rejection through the CI integration suite.
- [ ] Run the full workflow in the actual browser: Reception registration/check-in → Nurse triage → Doctor consultation/notes → discharge/history.
- [ ] Manually verify each role's allowed and prohibited UI actions and representative API routes; CI integration coverage is not a substitute for a lecturer-facing role demonstration.
- [ ] Verify public Display Board privacy, kiosk 60-second reset, Clinic Intelligence low-evidence/unavailable states, FlowTwin fixed-seed repeatability and relevant failure paths.
- [ ] Record actual results for NFR-05 load/concurrency, NFR-06 Display Board latency and NFR-10 accessibility, or explicitly retain these as not measured.
- [ ] Pin the final report to the exact tested code commit and list any subsequent documentation-only commits separately.
- [ ] Do not publish a final release tag or claim production readiness until the appropriate academic and operational release gates are reviewed. Real-clinic governance gates remain separate and open.

The CI evidence proves the configured automated checks for the pinned source commit only. It does not prove a complete user-operated browser acceptance session, local Windows clean-clone setup, staging/production deployment, backup restoration, clinical validation or hospital approval.

See [FINAL_SUBMISSION_HANDOFF.md](FINAL_SUBMISSION_HANDOFF.md) and [the 4 November workflow-integration evidence record](evidence/WORKFLOW_INTEGRATION_CI_2026-11-04.md) for the source identity, implemented changes and evidence boundaries.
