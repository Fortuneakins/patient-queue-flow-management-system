# PQFMS Clinic Intelligence Platform

This change introduces the first integrated foundation for Clinic Intelligence on a separate feature branch.

## Implemented in this tranche

- **Flight Recorder:** database-triggered, append-only, non-identifying events for queue check-in, priority changes and visit lifecycle changes, plus events for resources, pathways, referrals, scenarios and offline operational observations.
- **CareGraph foundation:** configurable pathway templates, stage dependencies, per-visit pathway instances and enforced stage transitions.
- **Resource Dependency Twin foundation:** resource inventory with service tags, capacity, availability states and administrative event tracking.
- **FlowTwin:** repeatable discrete-event capacity simulation comparing the current model with a proposed station-capacity change or initial service outage.
- **Synthetic Clinic Laboratory:** repeatable synthetic scenario generation. Synthetic outcomes are clearly labelled and are not represented as real patient data.
- **Prediction Truth Ledger:** versioned waiting-time forecasts and an authorised, auditable way to record a comparable observed outcome.
- **Patient Fairness Sentinel:** aggregate waiting-time dispersion by existing priority group; it never changes triage or makes clinical decisions.
- **Referral Relay:** status-controlled referral workflow with append-only state-change events.
- **Access Bridge foundation:** explicit SMS consent, masked contact lookup and a templated wait-estimate message path. Free-text health messages are not supported.
- **Continuity Mode foundation:** an IndexedDB outbox for non-clinical operational incidents and resource observations. The synchronisation API is idempotent. It does not allow offline clinical queue changes, triage changes, or storing patient-identifying details.

## Simulation assumptions and safety

The initial FlowTwin model is an operational planning aid, not a validated clinical prediction model. It uses a measured median consultation duration when at least five recent observations exist; otherwise it discloses a 15-minute illustrative fallback. Arrival times are uniformly distributed for scenario modelling and service durations are varied around the configured mean. Managers should validate results against real operations before relying on them.

The fairness signal reports group-level waiting-time dispersion only. It does not infer acuity and must never be used to downgrade or override clinician-assigned triage.

Forecast outcomes are manually recorded. A captured forecast is not automatically treated as accurate: staff must record a comparable observed waiting-time result for its stated cohort.

## Explicitly not yet implemented

The following require further integration and validation work and are not claimed as complete by this tranche:

- Real two-way USSD/voice/SMS interaction, carrier callbacks and delivery receipts.
- Offline check-in or offline clinical workflow mutation, encrypted clinical cache and conflict resolution.
- Real cross-clinic interoperability, tenancy enforcement across existing patient/staff tables, or federated learning.
- Production-grade predictive model calibration, clinical validation, or recommendations that autonomously change staffing/queue order.

These are intentionally separated from the first tranche so that connectivity recovery cannot silently mutate clinical state and a single-clinic schema cannot be mistaken for safe multi-tenant isolation.
