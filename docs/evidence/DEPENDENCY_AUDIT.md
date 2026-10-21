# Dependency Security Audit

**Review date:** 14 October 2026

## Production dependencies

The following production dependency audits completed with zero reported vulnerabilities:

- `npm --prefix backend audit --omit=dev`
- `npm --prefix frontend audit --omit=dev`

## Outstanding frontend development dependencies

The full frontend audit still reports 9 vulnerabilities: 3 moderate and 6 high.

The remaining findings involve the `braces`, `esbuild`, and `postcss-selector-parser` dependency chains. These are associated with the frontend build and development toolchain.

No forced major-version upgrades or unverified dependency overrides were applied. The existing frontend lint, production build, automated test suites, and load test passed after the compatible dependency updates.

## Follow-up

- Review updates to the Vite, Tailwind CSS, and PostCSS toolchain.
- Resolve remaining findings when compatible fixes or a tested migration are available.
- Re-run the complete test suite and both production and full dependency audits after any dependency changes.
- Avoid exposing the development server to untrusted networks.

A clean production dependency audit does not imply that all development dependencies or application code are free of security issues.



## Analytics runtime maintenance

The analytics runtime pins are maintained separately from test tooling in `requirements-dev.txt`. The runtime dependency set is checked in CI with `pip-audit`; a release must remediate reported known vulnerabilities or record a reviewed, time-limited exception before proceeding. Flask, Flask-CORS, Requests, Gunicorn and python-dotenv pins were updated to supported patched releases during the Clinic Intelligence deployment-readiness overhaul, based on the audit output and current package advisories. The audit is a point-in-time vulnerability check, not proof that application logic is secure.

