# PQFMS API overview

The API is a JSON REST service on port 5000. All protected routes require `Authorization: Bearer <token>`. Errors use `{ "error": "..." }` with HTTP status codes 400, 401, 403, 404, 409, 429 or 500 as appropriate.

## Authentication

`POST /api/auth/login` authenticates a staff account and returns an access token, role and account state.

`PUT /api/auth/change-password` changes the signed-in user's password. Newly-created accounts have `must_reset_password=true` and are blocked from ordinary protected operations until the temporary password is changed.

## Public queue

`POST /api/queue/check-in` is the kiosk self check-in route. It is rate-limited, accepts the patient identification number plus reason for visit, and returns a daily sequential ticket. Duplicate active visits return 409 with the existing ticket. The endpoint does not accept an arbitrary internal `patient_id`.

`GET /api/queue/public` returns only operational queue information required by the waiting-room Display Board.

`GET /api/patients/verify/:identification_number` performs an exact, rate-limited kiosk verification and returns only the patient's first name. It never returns the internal patient identifier.

## Staff queue lifecycle

`GET /api/queue` — Nurse/Doctor staff queue.

`PUT /api/queue/:id/priority` — Nurse/Doctor only.

`PUT /api/queue/:id/call` — Doctor only; sends optional SMS after the state transition commits.

`PUT /api/queue/:id/notes` — Doctor only; notes are editable only while In-Consultation.

`PUT /api/queue/:id/discharge` — Doctor only; records discharge actor/time.

## Patients and history

`POST /api/patients` — Reception/Admin patient registration.

`GET /api/patients?q=...` — authenticated directory search.

`GET /api/history?identification_number=...` — role-aware history. Consultation notes are returned only to Doctors.

`GET /api/history/overview` — role-based operational counts.

`GET /api/history/discharge-log` — Admin-only discharge log.

`GET /api/history/staff-performance` — Admin-only discharge counts using `discharged_at` for the current day.

## Administration

`GET /api/staff` — Admin or `VIEW_STAFF_DIRECTORY`.

`POST /api/auth/register` — Admin creates staff accounts.

`PUT /api/staff/:id/status` — Admin deactivates/reactivates accounts.

`PUT /api/staff/:id/permissions` — Admin grants/revokes `VIEW_STAFF_DIRECTORY`.

`GET /api/staff/:id/logins` — Admin-only recent sign-in history.

## Shifts and analytics

`POST /api/shifts`, `GET /api/shifts`, `DELETE /api/shifts/:id` — Admin scheduling.

`GET /api/shifts/on-duty` — internal service-to-service endpoint protected by `X-Internal-Service-Token`.

The Flask analytics service exposes `GET /api/predict`, returning estimates for tiers 1–4 plus `degraded` and staffing metadata.


## Clinic Intelligence (feature branch)

The authenticated `/api/intelligence` surface adds the Clinic Intelligence workflows. Every route also requires a password-ready staff account.

- **Admin-only oversight:** `GET /overview`, `GET /events`, simulation runs/history, benchmark profiles, synthetic lab, forecast capture/truth and fairness metrics.
- **CareGraph:** `GET /pathways`, `POST /pathways` (Admin), `GET /journeys/:queue_id`, `POST /journeys/:queue_id/assign` (Admin), and `PATCH /journeys/:queue_id/stages/:stage_id` (role-checked stage progression).
- **Resource status:** `GET /resources` for Nurse/Doctor/Admin; resource creation, status changes and `POST /offline-sync` are Admin-only. Offline sync accepts resource-status operations only and requires UUID idempotency keys.
- **Referral Relay:** `GET /referrals` for Nurse/Doctor/Admin; create and update are Doctor/Admin-only.
- **Access Bridge:** `GET /contact-preferences/:patient_id` for authorised staff; save preferences and send the two operational SMS templates are Reception/Admin-only. Sending requires recorded SMS consent, is throttled, and requires a configured Twilio provider to deliver. Wait estimates are obtained from the analytics service by the backend; client-supplied estimates are not trusted.

See [Clinic Intelligence implementation notes](../CLINIC_INTELLIGENCE.md) for the full access matrix, data-handling boundaries, model assumptions and non-production limitations.
