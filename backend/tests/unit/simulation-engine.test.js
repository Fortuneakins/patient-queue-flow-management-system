'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateQueue, runSyntheticLab, percentile } = require('../../src/services/simulationEngine');

test('FlowTwin simulation is deterministic for the same inputs and seed', () => {
  const input = { initialQueue: 12, arrivalCount: 8, horizonMinutes: 60, serviceMinutes: 15, staffedStations: 2, unavailableMinutes: 0, replications: 40, seed: 42 };
  assert.deepEqual(simulateQueue(input), simulateQueue(input));
});

test('simulation returns non-negative waits and bounded operational metrics', () => {
  const result = simulateQueue({ initialQueue: 5, arrivalCount: 10, horizonMinutes: 60, serviceMinutes: 12, staffedStations: 2, unavailableMinutes: 5, replications: 20, seed: 7 });
  assert.ok(result.predicted_wait_p50_minutes >= 0);
  assert.ok(result.predicted_wait_p90_minutes >= result.predicted_wait_p50_minutes);
  assert.ok(result.average_completed_by_horizon >= 0);
  assert.ok(result.average_completed_by_horizon <= 15);
  assert.ok(result.average_waiting_at_horizon >= 0);
  assert.match(result.model_version, /^pqfms-discrete-event-/);
});

test('simulation rejects invalid or unsafe capacity inputs', () => {
  assert.throws(() => simulateQueue({ initialQueue: 0, arrivalCount: 0, horizonMinutes: 60, serviceMinutes: 10, staffedStations: 0, unavailableMinutes: 0, replications: 5, seed: 1 }), /staffedStations/);
  assert.throws(() => simulateQueue({ initialQueue: -1, arrivalCount: 0, horizonMinutes: 60, serviceMinutes: 10, staffedStations: 1, unavailableMinutes: 0, replications: 5, seed: 1 }), /initialQueue/);
  assert.throws(() => simulateQueue({ initialQueue: 1, arrivalCount: 0, horizonMinutes: 5, serviceMinutes: 10, staffedStations: 1, unavailableMinutes: 0, replications: 5, seed: 1 }), /horizonMinutes/);
});

test('synthetic lab marks generated cases synthetic and repeats from seed', () => {
  const args = { cases: 25, seed: 99, baseQueue: 6, serviceMinutes: 15, staffedStations: 2 };
  const first = runSyntheticLab(args);
  const second = runSyntheticLab(args);
  assert.deepEqual(first, second);
  assert.equal(first.synthetic_only, true);
  assert.equal(first.cases, 25);
  assert.ok(first.backlog_case_rate_percent >= 0 && first.backlog_case_rate_percent <= 100);
});

test('an outage increases waiting in the same deterministic queue scenario', () => {
  const base = { initialQueue: 12, arrivalCount: 0, horizonMinutes: 120, serviceMinutes: 10, staffedStations: 2, replications: 40, seed: 11 };
  const normal = simulateQueue({ ...base, unavailableMinutes: 0 });
  const outage = simulateQueue({ ...base, unavailableMinutes: 20 });
  assert.ok(outage.predicted_wait_p50_minutes >= normal.predicted_wait_p50_minutes);
  assert.ok(outage.predicted_wait_p90_minutes >= normal.predicted_wait_p90_minutes);
});

test('percentile safely handles empty and singleton samples', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([4], 0.9), 4);
});