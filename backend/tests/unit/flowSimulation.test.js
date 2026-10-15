const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeScenario, runClinicSimulation, runSyntheticLab, MODEL_VERSION } = require('../../src/utils/flowSimulation');

test('scenario inputs have safe defaults and preserve explicit values', () => {
  assert.deepEqual(normalizeScenario(), {
    horizon_minutes: 60, extra_arrivals: 0, additional_stations: 0,
    station_loss: 0, doctor_delay_minutes: 0, seed: 20261015
  });
  assert.equal(normalizeScenario({ horizon_minutes: 90, extra_arrivals: 12, seed: 5 }).horizon_minutes, 90);
  assert.throws(() => normalizeScenario({ extra_arrivals: -1 }), /between 0 and 200/);
  assert.throws(() => normalizeScenario({ horizon_minutes: 29 }), /between 30 and 240/);
  assert.throws(() => normalizeScenario([]), /scenario object/);
});

test('simulation is deterministic for the same seed and inputs', () => {
  const options = {
    waiting: [{ priority_level: 1, queued_at: '2026-10-15T07:00:00Z', waiting_minutes: 10 }],
    in_consultation: 1, extra_arrivals: 8, servers: 2, horizon_minutes: 60,
    mean_service_minutes: 10, seed: 1234
  };
  const first = runClinicSimulation(options);
  const second = runClinicSimulation(options);
  assert.deepEqual(first, second);
  assert.equal(first.model_version, MODEL_VERSION);
  assert.equal(first.projected_arrivals, 8);
  assert.ok(first.projected_remaining >= 0);
  assert.ok(first.server_utilisation_percent >= 0 && first.server_utilisation_percent <= 100);
});

test('zero available service capacity never reports completed work', () => {
  const result = runClinicSimulation({
    waiting: [{ priority_level: 1 }, { priority_level: 4 }],
    in_consultation: 0, extra_arrivals: 5, servers: 0, horizon_minutes: 60, seed: 1
  });
  assert.equal(result.projected_completed, 0);
  assert.equal(result.projected_remaining, 7);
  assert.equal(result.server_utilisation_percent, null);
  assert.equal(result.mean_additional_wait_minutes, null);
});

test('synthetic lab returns reproducible aggregates and labels data as synthetic', () => {
  const input = { replications: 4, hours: 4, arrivals_per_hour: 3, servers: 2, mean_service_minutes: 10, seed: 99 };
  const first = runSyntheticLab(input);
  const second = runSyntheticLab(input);
  assert.deepEqual(first, second);
  assert.equal(first.results.length, 4);
  assert.equal(first.summary.model_quality, 'SYNTHETIC_ONLY');
  assert.ok(first.summary.average_projected_completed >= 0);
  assert.throws(() => runSyntheticLab({ replications: 201 }), /between 1 and 200/);
  assert.throws(() => runSyntheticLab({ mean_service_minutes: 2 }), /between 3 and 90/);
});
