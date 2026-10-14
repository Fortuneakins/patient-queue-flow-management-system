# PQFMS presentation runbook

## Reset

```powershell
.\scripts\reset-demo.ps1
```

Start the three components using `scripts\start-all.ps1`.

## Demonstration path

1. Open the Kiosk and verify a seeded synthetic patient.
2. Submit a reason and show the generated sequential ticket.
3. Open the Display Board and show the ticket/queue status.
4. Sign in as `nurse_demo` and assign a priority tier.
5. Switch to `doctor_demo`, open the consultation roster and call the patient.
6. Show the optional SMS behaviour or the graceful unavailable state.
7. Enter consultation notes and discharge the patient.
8. Open Patient History and demonstrate Doctor-only notes.
9. Sign in as `admin_demo`, show overview counts, discharge log, staff accounts and shifts.
10. Demonstrate a failure condition: attempt a duplicate check-in, forbidden role action or stop the analytics service.

## Technical defence points

- Daily tickets are database-backed and concurrency-safe.
- At most one active visit exists per patient via a partial unique index.
- Visit transitions are guarded using conditional updates.
- Public endpoints return a deliberately minimised data shape.
- Account deactivation is checked on every protected request.
- SMS/analytics failure is isolated from the core workflow.
- Migrations and seed data make the environment reproducible.
