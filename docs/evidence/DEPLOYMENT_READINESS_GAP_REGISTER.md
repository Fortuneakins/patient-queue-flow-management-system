# PQFMS deployment-readiness gap register

**Scope:** the engineering hardening and deployment scaffold on `feat/clinic-intelligence-operations-cockpit`.  
**Evidence boundary:** CI verifies the checks listed by the workflow at a specific commit. It does not mean a real clinic deployment occurred or that an organisation approved the system for patient care.

## Implemented and covered by automated checks

| Area | Change | Evidence/gate |
|---|---|---|
| Clinic Intelligence | Server-side deterministic rules produce severity, stable rule ID, supporting evidence and a suggested human action. | `backend/tests/unit/clinicInsightEngine.test.js`; `GET /api/intelligence/overview` returns the model/rule version and prompts. |
| Model transparency | Wait estimate reports its service-time evidence count/basis; under five eligible observations it uses an explicitly named 12-minute baseline; no-staff/dependency failure is unavailable, not zero. | Analytics estimator, API tests and CI. |
| Provenance | Operational analytics query excludes synthetic/demo rows; calibration uses only eligible operational service-duration records; provenance UI states that server policy is not identity/authenticity verification. | `analytics_service/tests/test_app.py`, `analytics_service/tests/test_estimator.py`, `docs/CLINIC_INTELLIGENCE.md`. |
| Production mode | Production rejects synthetic/demo provenance mode and obvious placeholder/weak/shared secrets; TLS, HTTPS CORS and separate analytics DB identity are checked at startup. | Backend and analytics runtime-policy unit tests. |
| Auth hardening | Per-IP/per-account login throttle is bounded in memory; production staff password policy is stronger; API headers and proxy trust are configured explicitly. | Backend unit tests and frontend lint/build. |
| Schema safety | Versioned checksum ledger, transactional migration application, advisory lock, baseline confirmation for a reviewed existing schema and production startup checksum verification. | CI migrates a fresh Postgres instance and runs DB-backed integration tests. |
| Database role separation | Runbook/config separate migration owner, API runtime DML role and column-limited read-only analytics role. | Compose validation and reviewed setup instructions; actual managed-database grants still need deployment verification. |
| Deployment packaging | Caddy HTTPS gateway, private API/analytics networking, compiled frontend proxy, health checks, non-root API/analytics container users, read-only filesystems/tmpfs, explicit TLS and secret configuration. | CI builds all three images and validates Nginx/Caddy config. |
| Dependency checks | CI checks backend/frontend production npm dependencies and analytics runtime Python dependencies. | `.github/workflows/ci.yml`; pip-audit for analytics runtime. |

## Required before a real clinic goes live

These are **open gates**, not features that CI can certify:

1. **MFA:** application-level multi-factor authentication is not implemented in this branch. A real clinical deployment needs MFA for privileged accounts at minimum, or a documented, approved compensating control from the responsible organisation before any live data is entered.
2. **Independent clinical and operational approval:** an accountable clinician/operations owner must verify triage semantics, call order, queue displays, downtime/paper fallback, user training and patient-facing wording. The wait model is operational planning support, never triage/diagnosis.
3. **Prospective analytics validation:** compare estimates with representative, independently captured operational observations; publish sample counts, uncertainty, error by relevant subgroup/time window, and drift/missing-data monitoring; have the responsible clinical/operations owner sign off. Synthetic test outcomes must not count as live accuracy evidence.
4. **Privacy/legal review:** verify the permitted processing basis, data minimisation, consent/communication practices, retention/deletion schedule, data-subject procedures, jurisdiction-specific health-data obligations and any required institutional approvals.
5. **Independent security assessment:** complete a threat model and penetration test; validate identity/session lifecycle, authorisation, XSS/CSRF posture, rate limits, logging/monitoring, secrets rotation, vulnerability remediation and incident response.
6. **Recovery assurance:** configure encrypted backups and point-in-time recovery as available, then rehearse a full restore to a separate environment and record measured recovery point/time. A backup file existing is not proof of recoverability.
7. **Actual deployment validation:** provision the real domain, managed PostgreSQL, trusted TLS chain, secret manager, database grants, firewall, monitoring/alerting, image digests, deployment owner and rollback plan. Verify health/readiness and normal plus dependency-failure cases through the real HTTPS endpoint.
8. **Dependency maintenance:** CI now blocks on known vulnerabilities in production npm dependencies and analytics runtime Python dependencies. Re-run and review the **full development-dependency** audit before release; the prior recorded frontend audit found development-tooling issues, and those must be rechecked/remediated or explicitly accepted under a tracked time-bound exception.
9. **Scale boundary:** do not horizontally scale API instances yet. Login throttles are process-local and Socket.IO does not have a cross-replica adapter. Use one API replica until shared throttling/realtime coordination are implemented and tested.
10. **Production identity bootstrap and live-data controls:** create the three DB roles with reviewed minimum privileges, run migrations with the migration role, verify runtime/analytics grants, provision named admin through the one-time bootstrap, and confirm seeded demo users are absent.

## Interpretation

The code and deployment packaging have been hardened and are CI-verified at a commit. The repository is **not yet authorised or proven for live clinical use**: no real infrastructure was provisioned, no managed database/restore was exercised, and the open governance/security/MFA/clinical-validation gates above remain. Do not store real patient data in the development or CI environment.
