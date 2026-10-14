# Changelog

## 1.0.0-final

- Rebuilt the application around the final PQFMS report architecture.
- Added PostgreSQL schema, migrations, integrity constraints and synthetic seed data.
- Added secure authentication, authorisation, deactivation checks and rate limiting.
- Implemented sequential daily ticket allocation and concurrency-safe check-in.
- Split queue lifecycle actions into explicit, role-protected endpoints.
- Added Doctor-only consultation notes and server-side privacy filtering.
- Added shift-overlap protection and staffing-aware wait estimation.
- Refactored the React client into feature-oriented modules.
- Added backend unit tests and analytics tests.
- Added setup, database, demo-reset and presentation runbook scripts.
- Added CI, API documentation and repository security guidance.
