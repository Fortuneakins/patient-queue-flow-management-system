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


## Final academic source freeze (4 November 2026)

- [ ] Confirm the assessed code commit is `4855a7d368d047baa4c3753cced7a6bd5c8ce5fd` or a later commit with a fresh successful CI run.
- [ ] Retain CI run 470 (`39592355041`) as evidence for the 4855a7d code commit; do not describe it as a manual browser acceptance run.
- [ ] Keep the 22 October Rev 1.2 test counts as historical evidence only; do not add them to November test counts.
- [ ] Add the Clinic Intelligence supplementary use-case, architecture/service and data-model diagrams to the final report where the full release scope is described.
- [ ] Reconcile role/route claims with `backend/src/routes/intelligence.routes.js`; source inspection alone is not proof of exhaustive role-matrix execution.
- [ ] Run and record the complete synthetic patient browser journey, role restrictions, public-display privacy, Clinic Intelligence low-evidence states, FlowTwin repeatability and failure paths.
- [ ] Record actual results for NFR-05 load, NFR-06 Display Board latency and NFR-10 accessibility, or explicitly retain them as not measured.
- [ ] Pin the final report to the exact tested code commit and list any subsequent documentation-only commits separately.
- [ ] Do not publish a final tag or claim production readiness until all release gates appropriate to the academic prototype are reviewed. Real-clinic governance gates remain separate and open.

See [FINAL_SUBMISSION_HANDOFF.md](FINAL_SUBMISSION_HANDOFF.md) for the assessed source identity, CI scope, manual acceptance plan and production boundary.
