const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeScenario, reconstructScenario, ENGINE_VERSION } = require('../../src/utils/continuityEngine');

test('continuity scenario is deterministic for the same seed and options', () => {
  const input = { scenario_code: 'RMSH_DOWNTIME_RECOVERY', seed: 20261019, outage_minutes: 45 };
  assert.deepEqual(reconstructScenario(input), reconstructScenario(input));
  assert.equal(reconstructScenario(input).engine_version, ENGINE_VERSION);
});

test('synthetic scenario identifies exact replays and semantic duplicate events', () => {
  const result = reconstructScenario({ seed: 25, outage_minutes: 45 });
  assert.equal(result.source_scope, 'SYNTHETIC_ONLY');
  assert.ok(result.summary.duplicate_event_count >= 1);
  assert.ok(result.anomalies.some(item => item.type === 'DUPLICATE_EVENT'));
  assert.ok(result.anomalies.some(item => item.type === 'SEMANTIC_DUPLICATE'));
});

test('synthetic scenario flags an invalid discharge transition for human review', () => {
  const result = reconstructScenario({ seed: 25, outage_minutes: 45 });
  assert.ok(result.anomalies.some(item =>
    item.type === 'INVALID_TRANSITION' &&
    item.visit_ref === 'SYN-VISIT-003' &&
    item.from_state === 'WAITING' &&
    item.proposed_state === 'DISCHARGED' &&
    item.requires_review
  ));
  const visit = result.visits.find(item => item.visit_ref === 'SYN-VISIT-003');
  assert.equal(visit.disposition, 'REVIEW_REQUIRED');
});

test('late paper entries and occurrence-versus-recording order discrepancies are explained', () => {
  const result = reconstructScenario({ seed: 25, outage_minutes: 60 });
  assert.ok(result.summary.late_recorded_event_count > 0);
  assert.ok(result.anomalies.some(item => item.type === 'RECORDING_ORDER_DIFFERS_FROM_OCCURRENCE_ORDER'));
});

test('only the supported synthetic scenario and bounded input values are accepted', () => {
  assert.equal(normalizeScenario({}).scenario_code, 'RMSH_DOWNTIME_RECOVERY');
  assert.throws(() => normalizeScenario({ scenario_code: 'REAL_PATIENT_IMPORT' }), /Only the built-in synthetic RMSH downtime scenario/);
  assert.throws(() => normalizeScenario({ outage_minutes: 2 }), /between 45 and 240/);
  assert.throws(() => normalizeScenario({ seed: -1 }), /between 1 and 2147483647/);
  assert.throws(() => normalizeScenario([]), /scenario object/);
});
