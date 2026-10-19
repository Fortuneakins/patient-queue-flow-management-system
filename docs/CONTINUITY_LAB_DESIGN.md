# Operational Continuity Lab — design and verification

## Purpose

The Operational Continuity Lab is the first synthetic prototype of the PQFMS Continuity & Intelligence Twin. It explores how the system can distinguish event occurrence time from recording time, detect duplicate and inconsistent workflow events, reconstruct a per-visit operational timeline, and preserve reviewable evidence.

The scenario is motivated by the original RMSH OPD problem: replacing paper-based patient-flow tracking with a reliable digital workflow. This increment is deliberately limited to a built-in synthetic scenario. It does not ingest photographs or scans of real paper records, read or modify live queue visits, reconcile real patient identities, or claim to prove what happened in an actual clinic.

## Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-CONT-01 | An administrator shall be able to run the built-in synthetic RMSH downtime scenario using a configurable seed and outage duration. | Integration test confirms authorised execution and response values. |
| FR-CONT-02 | The engine shall preserve a synthetic source-event reference, source type, occurrence minute and recording minute for each input event. | Unit tests and the result's event/timeline structures. |
| FR-CONT-03 | The engine shall identify repeated source-event references, semantic duplicates, invalid state transitions and occurrence/recording-order discrepancies. | Unit tests assert each discrepancy type on the known scenario. |
| FR-CONT-04 | The system shall persist scenario inputs, engine version and output, and append an operational event in the same database transaction. | Integration test retrieves the persisted run and its Flight Recorder event. |
| FR-CONT-05 | An administrator shall be able to review per-visit reconstructed timelines, discrepancy explanations and prior run results. | Manual UI acceptance on the Continuity Lab panel. |

## Quality requirements and business rules

| ID | Rule or requirement |
|---|---|
| NFR-CONT-01 | Re-running the same scenario with the same seed and input values shall produce the same reconstruction output. |
| NFR-CONT-02 | The first increment shall operate only on generated synthetic records and shall not retrieve or modify patient, queue, consultation or referral records. |
| NFR-CONT-03 | Continuity scenario endpoints and run history shall require an authenticated administrator account. |
| BR-CONT-01 | An event that violates the configured synthetic state-transition model shall be reported as a discrepancy and shall not advance the reconstructed state. |
| BR-CONT-02 | Events with uncertain or conflicting provenance shall remain visible and be flagged for review; the engine shall not silently merge patient identities or modify source records. |
| BR-CONT-03 | All outputs from this increment shall be labelled `SYNTHETIC_ONLY`; the workflow model is not a clinical protocol and does not determine clinical priority. |

## Synthetic model

The built-in scenario contains four synthetic visit references. It includes repeated source event references, a cross-source semantic duplicate, a discharge attempt that skips a required consultation state, paper events recorded after recovery, and one visit whose recording order differs from its occurrence order.

Allowed transitions in this model are:

`START → REGISTERED → WAITING → TRIAGED → IN_CONSULTATION → DISCHARGED`

The model also permits `WAITING → IN_CONSULTATION` because the current PQFMS queue implementation allows a waiting visit to be called without a stored triage tier. This sequence checker is an operational test fixture, not an assertion that every clinical pathway must use the same sequence.

The timeline is ordered by occurrence minute. Recording time is retained as separate provenance. An anomaly does not delete source events. The result shows both raw synthetic input and the accepted reconstruction, including the entries omitted from reconstructed state progression.

## Implementation components

- `backend/src/utils/continuityEngine.js`: pure, deterministic scenario generation, deduplication, transition checking and discrepancy analysis.
- `backend/src/services/continuityService.js`: persistence and Flight Recorder event insertion within one database transaction.
- `backend/src/routes/intelligence.routes.js`: administrator-only run and history endpoints.
- `db/migrations/005_continuity_runs.sql`: persisted run input/output, engine version, seed and synthetic-scope guard.
- `frontend/src/features/admin/intelligence/ContinuityLabPanel.jsx`: scenario controls, summary, per-visit replay, discrepancy explanations and prior runs.
- `backend/tests/unit/continuityEngine.test.js`: deterministic and discrepancy-focused unit tests.
- `backend/tests/integration/continuity.test.js`: access control, validation, persistence and audit-event integration tests.

## Known limitations

- Only the pre-defined synthetic scenario is supported; no real paper form or external source import is implemented.
- Event references are synthetic and have no link to a real patient identity.
- The transition model checks a small, explicitly defined operational state machine. It does not verify clinical correctness, clinical pathway appropriateness or legal record requirements.
- The scenario is illustrative and is not evidence of actual outage patterns, staff behaviour or performance at RMSH.
- A successful synthetic reconciliation result must not be described as a validated production downtime-recovery solution.
- The next possible increment is a process-analysis view that consumes verified operational events and compares observed pathways with the configured CareGraph model, again beginning with synthetic or specifically authorised data.

## Verification procedure

Run:

```powershell
npm --prefix backend run verify
npm --prefix backend run test:integration
npm --prefix frontend run lint
npm --prefix frontend run build
```

The integration suite requires PostgreSQL, the sorted migrations and the synthetic demo seed data. Record only observed test results against the release commit being submitted.
