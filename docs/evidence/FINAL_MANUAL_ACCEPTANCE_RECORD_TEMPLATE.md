# PQFMS final manual acceptance record

Use one copy of this record per acceptance session. Do not mark a case PASS until it has actually been executed against the pinned code revision.

## Session metadata

- Date/time (local):
- Tester:
- Repository branch:
- Full commit SHA:
- Environment / browser / OS:
- API and analytics base URLs:
- Database fixture / provenance mode:
- Test data: synthetic only (confirm):
- Evidence folder / screenshot references:

## Result convention

- **PASS:** observed result matches the expected result and evidence is retained.
- **FAIL:** observed result differs from expected result; record defect and reproduction steps.
- **BLOCKED:** test could not be executed because a dependency/environment/precondition was unavailable.
- **NOT RUN:** no execution attempted.
- **NOT APPLICABLE:** explain why the scenario does not apply to this release.

## Acceptance cases

| ID | Role | Scenario | Expected result | Actual result | Status | Evidence reference | Defect / notes |
|---|---|---|---|---|---|---|---|
| MA-01 | Reception | Register synthetic patient and validate SA ID/passport | Valid data accepted; invalid data rejected with safe message | | NOT RUN | | |
| MA-02 | Reception | Check in patient and issue ticket | Sequential daily ticket generated | | NOT RUN | | |
| MA-03 | Reception | Repeat active check-in | Duplicate active visit rejected; no second ticket | | NOT RUN | | |
| MA-04 | Nurse | Triage and inspect queue order | Valid tier recorded; queue ordering follows documented rules | | NOT RUN | | |
| MA-05 | Nurse | CareGraph stage progression | Required predecessor and stage-role rules enforced | | NOT RUN | | |
| MA-06 | Doctor | Call patient to room | Queue state changes and authorised display updates | | NOT RUN | | |
| MA-07 | Doctor | Add consultation note and discharge | Note persists; discharge closes visit; history access is role-limited | | NOT RUN | | |
| MA-08 | Public | Inspect Display Board and public API response | Ticket/status only; no name, identifier or clinical note exposure | | NOT RUN | | |
| MA-09 | Each role | Attempt prohibited route/action | Server rejects unauthorised action; no mutation occurs | | NOT RUN | | |
| MA-10 | Admin | Review Clinic Intelligence insight | Rule ID, severity, evidence and human action are explained | | NOT RUN | | |
| MA-11 | Admin | Exercise low-sample/unavailable estimate state | Limitation is explicit; unavailable is not represented as zero | | NOT RUN | | |
| MA-12 | Admin | Repeat FlowTwin scenario with same seed/inputs | Reproducible output; no patient or triage mutation | | NOT RUN | | |
| MA-13 | Admin | Repeat offline resource sync with same idempotency key | Duplicate request does not apply a different update twice | | NOT RUN | | |
| MA-14 | Admin/Reception | Send communication without consent / with consent | No send without recorded consent; allowed send is rate-limited and logged | | NOT RUN | | |
| MA-15 | Kiosk | Leave ticket confirmation visible | Ticket view resets after 60 seconds; cleanup occurs on state change/unmount | | NOT RUN | | |
| MA-16 | System | Make analytics dependency unavailable | Core workflow remains safe; estimate state is unavailable/degraded, not fabricated | | NOT RUN | | |
| MA-17 | System | Attempt invalid pathway transition | Invalid transition rejected without partial mutation | | NOT RUN | | |
| MA-18 | System | Trigger SMS provider failure | Core queue workflow remains available; failure is handled and logged safely | | NOT RUN | | |

## Quantitative NFR measurements

| Requirement | Method | Target | Measured result | Status | Evidence |
|---|---|---|---|---|---|
| NFR-05 | Configured load probe; record concurrency, request count, p95 and 5xx | 50 simulated users for 60 seconds; p95 ≤ 2 seconds; zero 5xx | | NOT RUN | |
| NFR-06 | 30 Display Board refresh measurements | Each refresh ≤ 3 seconds | | NOT RUN | |
| NFR-10 | Lighthouse accessibility audit plus keyboard/focus review | Lighthouse accessibility ≥ 90 and keyboard operability | | NOT RUN | |

## Defects and disposition

| Defect ID | Severity | Reproduction steps | Expected | Actual | Fix commit | Retest result |
|---|---|---|---|---|---|---|

## Sign-off

- Tester conclusion:
- Open blockers:
- Accepted limitations:
- Date:
- Reviewer (if applicable):
