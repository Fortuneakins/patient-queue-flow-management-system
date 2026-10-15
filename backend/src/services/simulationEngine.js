'use strict';

function makeRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14) >>> 0) >>> 0) / 4294967296;
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return Number((sorted[lower] + (sorted[upper] - sorted[lower]) * fraction).toFixed(2));
}

function validate(input) {
  const bounds = [
    ['initialQueue', 0, 2000],
    ['arrivalCount', 0, 500],
    ['horizonMinutes', 15, 480],
    ['serviceMinutes', 1, 240],
    ['staffedStations', 1, 50],
    ['unavailableMinutes', 0, 240],
    ['replications', 1, 200]
  ];
  for (const [key, min, max] of bounds) {
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(key + ' must be an integer between ' + min + ' and ' + max + '.');
    }
  }
}

function simulateQueue(input) {
  validate(input);
  const runs = [];
  for (let rep = 0; rep < input.replications; rep += 1) {
    const random = makeRandom((Number(input.seed) + rep * 104729) >>> 0);
    const arrivals = [];
    for (let i = 0; i < input.initialQueue; i += 1) arrivals.push({ at: 0, ordinal: i });
    for (let i = 0; i < input.arrivalCount; i += 1) {
      arrivals.push({ at: random() * input.horizonMinutes, ordinal: input.initialQueue + i });
    }
    arrivals.sort((a, b) => a.at - b.at || a.ordinal - b.ordinal);
    const serverAvailable = Array(input.staffedStations).fill(input.unavailableMinutes);
    const waits = [];
    let completedByHorizon = 0;
    let waitingAtHorizon = 0;
    for (const arrival of arrivals) {
      let server = 0;
      for (let i = 1; i < serverAvailable.length; i += 1) {
        if (serverAvailable[i] < serverAvailable[server]) server = i;
      }
      const start = Math.max(arrival.at, serverAvailable[server]);
      const wait = Math.max(0, start - arrival.at);
      const service = input.serviceMinutes * (0.5 + random());
      const finish = start + service;
      serverAvailable[server] = finish;
      waits.push(wait);
      if (finish <= input.horizonMinutes) completedByHorizon += 1;
      if (arrival.at <= input.horizonMinutes && start > input.horizonMinutes) waitingAtHorizon += 1;
    }
    runs.push({
      p50: percentile(waits, 0.5),
      p90: percentile(waits, 0.9),
      completed: completedByHorizon,
      waiting: waitingAtHorizon
    });
  }
  const allP50 = runs.map(r => r.p50);
  const allP90 = runs.map(r => r.p90);
  return {
    model_version: 'pqfms-discrete-event-v1',
    replications: input.replications,
    horizon_minutes: input.horizonMinutes,
    predicted_wait_p50_minutes: percentile(allP50, 0.5),
    predicted_wait_p90_minutes: percentile(allP90, 0.5),
    average_completed_by_horizon: Number((runs.reduce((sum, r) => sum + r.completed, 0) / runs.length).toFixed(2)),
    average_waiting_at_horizon: Number((runs.reduce((sum, r) => sum + r.waiting, 0) / runs.length).toFixed(2)),
    simulated_visits_per_replication: input.initialQueue + input.arrivalCount,
    limitations: [
      'This is an operational capacity simulation, not a clinical triage or treatment model.',
      'Hypothetical arrivals are distributed uniformly across the selected horizon.',
      'Service durations are varied around the supplied mean; real service-time distributions may differ.',
      'A station outage applies to all simulated stations for the initial outage interval.'
    ]
  };
}

function runSyntheticLab({ cases = 100, seed = 20261015, baseQueue = 8, serviceMinutes = 15, staffedStations = 1 }) {
  if (!Number.isInteger(cases) || cases < 10 || cases > 500) throw new RangeError('cases must be an integer between 10 and 500.');
  if (!Number.isInteger(baseQueue) || baseQueue < 0 || baseQueue > 2000) throw new RangeError('baseQueue must be between 0 and 2000.');
  if (!Number.isFinite(serviceMinutes) || serviceMinutes < 1 || serviceMinutes > 240) throw new RangeError('serviceMinutes must be between 1 and 240.');
  if (!Number.isInteger(staffedStations) || staffedStations < 1 || staffedStations > 50) throw new RangeError('staffedStations must be between 1 and 50.');
  const random = makeRandom(seed);
  const p90s = [];
  const waitsAtHorizon = [];
  const capacityChanges = [];
  for (let i = 0; i < cases; i += 1) {
    const queue = Math.max(0, baseQueue + Math.round((random() - 0.35) * Math.max(4, baseQueue)));
    const arrivals = Math.floor(random() * 17);
    const horizon = 60;
    const stations = Math.max(1, Math.min(50, staffedStations + (random() > 0.82 ? 1 : 0)));
    const outage = random() > 0.92 ? Math.floor(random() * 16) : 0;
    const result = simulateQueue({
      initialQueue: queue,
      arrivalCount: arrivals,
      horizonMinutes: horizon,
      serviceMinutes,
      staffedStations: stations,
      unavailableMinutes: outage,
      replications: 1,
      seed: (Number(seed) + i * 7919) >>> 0
    });
    p90s.push(result.predicted_wait_p90_minutes);
    waitsAtHorizon.push(result.average_waiting_at_horizon);
    capacityChanges.push(stations);
  }
  return {
    lab_version: 'pqfms-synthetic-lab-v1',
    synthetic_only: true,
    cases,
    seed,
    p50_p90_wait_minutes: percentile(p90s, 0.5),
    p90_p90_wait_minutes: percentile(p90s, 0.9),
    cases_with_backlog_at_horizon: waitsAtHorizon.filter(n => n > 0).length,
    backlog_case_rate_percent: Number((waitsAtHorizon.filter(n => n > 0).length / cases * 100).toFixed(1)),
    average_station_count: Number((capacityChanges.reduce((sum, n) => sum + n, 0) / cases).toFixed(2)),
    disclaimer: 'All generated cases are synthetic and must not be interpreted as real patient forecasts.'
  };
}

module.exports = { makeRandom, percentile, simulateQueue, runSyntheticLab };