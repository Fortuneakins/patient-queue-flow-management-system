# PQFMS Clinic Intelligence Platform

This change introduces the first integrated foundation for Clinic Intelligence on a separate feature branch.

## Implemented in this tranche

- **Flight Recorder:** database-triggered, append-only, non-identifying events for queue check-in, priority changes and visit lifecycle changes, plus events for resources, pathways, referrals, scenarios and offline operational observations. The admin timeline filters by date and expands non-identifying event details.
- **CareGraph foundation:** admins can create ordered pathway templates; stage dependencies are enforced per visit, and a stage becomes BLOCKED when no available resource matches its required tags. Starting a stage checks its required resource tags; a missing available resource marks it BLOCKED and creates an event for review.
- **Resource Dependency Twin foundation:** resource inventory with service tags, capacity, availability states and administrative event tracking.
- **FlowTwin:** repeatable discrete-event capacity simulation comparing a no-outage baseline with a proposed station-capacity change and/or initial service outage. It displays warnings when the proposed station count exceeds registered available resources or scheduled doctor coverage.
- **Synthetic Clinic Laboratory:** repeatable synthetic scenario generation. Synthetic outcomes are clearly labelled and are not represented as real patient data.
- **Prediction Truth Ledger:** versioned waiting-time forecasts and an authorised, auditable way to record a comparable observed outcome.
- **Patient Fairness Sentinel:** aggregate waiting-time dispersion by existing priority group; it never changes triage or makes clinical decisions.
- **Referral Relay:** status-controlled referral workflow with append-only state-change events.
- **Access Bridge foundation:** explicit SMS consent, masked contact lookup, a templated wait-estimate message path and an optional Twilio-signed inbound START/STOP/HELP command endpoint. STOP withdraws consent for all records matching a shared number; START is only accepted when exactly one patient record matches. Raw inbound message text and phone numbers are not written to the operational event log. Provider configuration is required.
- **Continuity Mode foundation:** an IndexedDB outbox for non-clinical operational incidents and resource observations. Sync is idempotent; reusing an event ID with a different payload is rejected, and resource observations must refer to an existing resource. It does not allow offline clinical queue changes, triage changes, or storing patient-identifying details.

## Simulation assumptions and safety

The initial FlowTwin model is an operational planning aid, not a validated clinical prediction model. It uses a measured median consultation duration when at least five recent observations exist; otherwise it discloses a 15-minute illustrative fallback. Arrival times are uniformly distributed for scenario modelling and service durations are varied around the configured mean. Managers should validate results against real operations before relying on them.

The fairness signal reports group-level waiting-time dispersion only. It does not infer acuity and must never be used to downgrade or override clinician-assigned triage.

Forecast outcomes are manually recorded. A captured forecast is not automatically treated as accurate: staff must record a comparable observed waiting-time result for its stated cohort.

## Explicitly not yet implemented

The following require further integration and validation work and are not claimed as complete by this tranche:

- USSD/voice interaction and provider delivery callbacks/receipts remain external follow-up work. The inbound SMS commands are implemented, but must be configured and tested against a real Twilio webhook before deployment.
- Offline check-in or offline clinical workflow mutation, encrypted clinical cache and conflict resolution.
- Real cross-clinic interoperability, tenancy enforcement across existing patient/staff tables, or federated learning.
- Production-grade predictive model calibration, clinical validation, or recommendations that autonomously change staffing/queue order.

These are intentionally separated from the first tranche so that connectivity recovery cannot silently mutate clinical state and a single-clinic schema cannot be mistaken for safe multi-tenant isolation.
