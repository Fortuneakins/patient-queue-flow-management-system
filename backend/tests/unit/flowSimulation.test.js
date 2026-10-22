
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeScenario,
  calculateScenarioServers,
  runClinicSimulation,
  runSyntheticLab,
  MODEL_VERSION
} = require('../../src/utils/flowSimulation');

test('scenario inputs have safe defaults and preserve explicit values', () => {
  assert.deepEqual(normalizeScenario(), {
    horizon_minutes: 60,
    extra_arrivals: 0,
    additional_stations: 0,
    station_loss: 0,
    doctor_delay_minutes: 0,
    seed: 20261015
  });

  assert.equal(
    normalizeScenario({
      horizon_minutes: 90,
      extra_arrivals: 12,
      seed: 5
    }).horizon_minutes,
    90
  );

  assert.throws(
    () => normalizeScenario({ extra_arrivals: -1 }),
    /between 0 and 200/
  );

  assert.throws(
    () => normalizeScenario({ horizon_minutes: 29 }),
    /between 30 and 240/
  );

  assert.throws(
    () => normalizeScenario([]),
    /scenario object/
  );
});

test('scenario servers respect recorded room capacity', () => {
  assert.equal(
    calculateScenarioServers({
      baselineServers: 1,
      additionalStations: 1,
      roomCapacity: 1
    }),
    1
  );

  assert.equal(
    calculateScenarioServers({
      baselineServers: 1,
      additionalStations: 1,
      roomCapacity: 2
    }),
    2
  );

  assert.equal(
    calculateScenarioServers({
      baselineServers: 50,
      additionalStations: 8,
      roomCapacity: null
    }),
    50
  );

  assert.equal(
    calculateScenarioServers({
      baselineServers: 1,
      additionalStations: 0,
      stationLoss: 3,
      roomCapacity: 4
    }),
    0
  );

  assert.throws(
    () => calculateScenarioServers({
      baselineServers: 1,
      additionalStations: 1,
      roomCapacity: -1
    }),
    /roomCapacity must be a non-negative integer/
  );
});

test('simulation is deterministic for the same seed and inputs', () => {
  const options = {
    waiting: [{
      priority_level: 1,
      queued_at: '2026-10-15T07:00:00Z',
      waiting_minutes: 10
    }],
    in_consultation: 1,
    extra_arrivals: 8,
    servers: 2,
    horizon_minutes: 60,
    mean_service_minutes: 10,
    seed: 1234
  };

  const first = runClinicSimulation(options);
  const second = runClinicSimulation(options);

  assert.deepEqual(first, second);
  assert.equal(first.model_version, MODEL_VERSION);
  assert.equal(first.projected_arrivals, 8);
  assert.ok(first.projected_remaining >= 0);
  assert.ok(
    first.server_utilisation_percent >= 0
      && first.server_utilisation_percent <= 100
  );
});

test('wait percentiles can exceed the simulation horizon when backlog extends beyond the arrival window', () => {
  const result = runClinicSimulation({
    waiting: [],
    in_consultation: 0,
    extra_arrivals: 48,
    servers: 1,
    horizon_minutes: 240,
    mean_service_minutes: 14,
    seed: 777
  });

  assert.equal(result.projected_arrivals, 48);
  assert.ok(result.projected_remaining > 0);
  assert.ok(result.p90_additional_wait_minutes > result.horizon_minutes);
});

test('zero available service capacity never reports completed work', () => {
  const result = runClinicSimulation({
    waiting: [
      { priority_level: 1 },
      { priority_level: 4 }
    ],
    in_consultation: 0,
    extra_arrivals: 5,
    servers: 0,
    horizon_minutes: 60,
    seed: 1
  });

  assert.equal(result.projected_completed, 0);
  assert.equal(result.projected_remaining, 7);
  assert.equal(result.server_utilisation_percent, null);
  assert.equal(result.mean_additional_wait_minutes, null);
});

test('synthetic lab returns reproducible aggregates and labels data as synthetic', () => {
  const input = {
    replications: 4,
    hours: 4,
    arrivals_per_hour: 3,
    servers: 2,
    mean_service_minutes: 10,
    seed: 99
  };

  const first = runSyntheticLab(input);
  const second = runSyntheticLab(input);

  assert.deepEqual(first, second);
  assert.equal(first.results.length, 4);
  assert.equal(first.summary.model_quality, 'SYNTHETIC_ONLY');
  assert.ok(first.summary.average_projected_completed >= 0);

  assert.throws(
    () => runSyntheticLab({ replications: 201 }),
    /between 1 and 200/
  );

  assert.throws(
    () => runSyntheticLab({ mean_service_minutes: 2 }),
    /between 3 and 90/
  );
});

test('paired capacity scenarios keep demand fixed and respond to additional capacity', () => {
  const shared = {
    waiting: [],
    in_consultation: 0,
    extra_arrivals: 20,
    horizon_minutes: 90,
    mean_service_minutes: 12,
    service_durations: [],
    doctor_delay_minutes: 0,
    seed: 20261015
  };

  const baseline = runClinicSimulation({
    ...shared,
    servers: 1
  });

  const intervention = runClinicSimulation({
    ...shared,
    servers: 2
  });

  const repeatedIntervention = runClinicSimulation({
    ...shared,
    servers: 2
  });

  // A fixed seed makes the intervention reproducible.
  assert.deepEqual(intervention, repeatedIntervention);

  // Both scenarios represent the same arrivals and horizon.
  assert.equal(baseline.projected_arrivals, 20);
  assert.equal(intervention.projected_arrivals, 20);
  assert.equal(baseline.horizon_minutes, 90);
  assert.equal(intervention.horizon_minutes, 90);

  // Only modelled service capacity changes.
  assert.equal(baseline.available_servers, 1);
  assert.equal(intervention.available_servers, 2);

  // Account for every arrival as completed or remaining.
  assert.equal(
    baseline.projected_completed + baseline.projected_remaining,
    20
  );

  assert.equal(
    intervention.projected_completed + intervention.projected_remaining,
    20
  );

  assert.ok(
    intervention.projected_completed > baseline.projected_completed,
    'additional modelled capacity should increase projected completions'
  );

  assert.ok(
    intervention.projected_remaining < baseline.projected_remaining,
    'additional modelled capacity should reduce the projected remaining queue'
  );

  assert.ok(Number.isFinite(baseline.p50_additional_wait_minutes));
  assert.ok(Number.isFinite(intervention.p50_additional_wait_minutes));
  assert.ok(Number.isFinite(baseline.p90_additional_wait_minutes));
  assert.ok(Number.isFinite(intervention.p90_additional_wait_minutes));

  assert.ok(
    intervention.p50_additional_wait_minutes < baseline.p50_additional_wait_minutes,
    'the intervention should reduce median wait in this fixed-seed scenario'
  );

  assert.ok(
    intervention.p90_additional_wait_minutes < baseline.p90_additional_wait_minutes,
    'the intervention should reduce P90 wait in this fixed-seed scenario'
  );

  // The scenarios use default assumptions, not operational observations.
  assert.equal(baseline.model_quality, 'DEFAULT_ASSUMPTION');
  assert.equal(intervention.model_quality, 'DEFAULT_ASSUMPTION');
  assert.equal(baseline.service_samples_used, 0);
  assert.equal(intervention.service_samples_used, 0);
});
