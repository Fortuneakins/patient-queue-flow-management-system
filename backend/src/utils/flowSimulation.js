const MODEL_VERSION = 'flowtwin-1.0.0';

function integerInRange(value, fallback, min, max, name) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(name + ' must be an integer between ' + min + ' and ' + max + '.'), { status: 400 });
  }
  return parsed;
}

function normalizeScenario(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('A scenario object is required.'), { status: 400 });
  }
  return {
    horizon_minutes: integerInRange(input.horizon_minutes, 60, 30, 240, 'horizon_minutes'),
    extra_arrivals: integerInRange(input.extra_arrivals, 0, 0, 200, 'extra_arrivals'),
    additional_stations: integerInRange(input.additional_stations, 0, 0, 8, 'additional_stations'),
    station_loss: integerInRange(input.station_loss, 0, 0, 8, 'station_loss'),
    doctor_delay_minutes: integerInRange(input.doctor_delay_minutes, 0, 0, 180, 'doctor_delay_minutes'),
    seed: integerInRange(input.seed, 20261015, 1, 2147483647, 'seed')
  };
}

function seededRandom(initialSeed) {
  let state = (Number(initialSeed) >>> 0) || 1;
  return function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function cleanWaiting(waiting) {
  if (!Array.isArray(waiting)) return [];
  return waiting.slice(0, 1000).map((item, index) => ({
    priority_level: Number.isInteger(Number(item.priority_level)) && Number(item.priority_level) >= 1 && Number(item.priority_level) <= 4 ? Number(item.priority_level) : 4,
    queued_at: item.queued_at ? new Date(item.queued_at).getTime() : index,
    waiting_minutes: Math.max(0, Number(item.waiting_minutes) || 0)
  })).sort((a, b) => a.priority_level - b.priority_level || a.queued_at - b.queued_at);
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)].toFixed(1));
}

function runClinicSimulation(options = {}) {
  const horizon = integerInRange(options.horizon_minutes, 60, 1, 720, 'horizon_minutes');
  const arrivals = integerInRange(options.extra_arrivals, 0, 0, 1000, 'extra_arrivals');
  const serverCount = integerInRange(options.servers, 1, 0, 50, 'servers');
  const activeConsultations = integerInRange(options.in_consultation, 0, 0, 1000, 'in_consultation');
  const waiting = cleanWaiting(options.waiting);
  const delay = integerInRange(options.doctor_delay_minutes, 0, 0, 720, 'doctor_delay_minutes');
  const meanService = Math.max(1, Math.min(240, Number(options.mean_service_minutes) || 12));
  const serviceDurations = Array.isArray(options.service_durations) ? options.service_durations.map(Number).filter(value => Number.isFinite(value) && value >= 1 && value <= 240).slice(0, 500) : [];
  const random = seededRandom(options.seed || 20261015);
  const servers = Array.from({ length: serverCount }, () => 0);
  const completionTimes = [];
  let totalBusyMinutes = 0;
  function drawServiceTime() {
    if (serviceDurations.length) return serviceDurations[Math.floor(random() * serviceDurations.length)];
    return Math.max(2, Math.min(90, meanService * (0.65 + random() * 0.7)));
  }
  for (let index = 0; index < activeConsultations; index += 1) {
    if (!servers.length) break;
    let serverIndex = 0;
    for (let candidate = 1; candidate < servers.length; candidate += 1) { if (servers[candidate] < servers[serverIndex]) serverIndex = candidate; }
    const remaining = drawServiceTime() * 0.5;
    servers[serverIndex] += remaining;
    completionTimes.push(servers[serverIndex]);
    totalBusyMinutes += remaining;
  }
  if (servers.length && delay > 0) servers[0] += delay;
  const jobs = waiting.map((item, index) => ({ arrival: 0, priority: item.priority_level, order: index, kind: 'existing' }));
  for (let index = 0; index < arrivals; index += 1) {
    jobs.push({ arrival: Math.floor(((index + 1) * horizon) / (arrivals + 1)), priority: 4, order: waiting.length + index, kind: 'synthetic' });
  }
  jobs.sort((a, b) => a.arrival - b.arrival || (a.arrival === 0 && b.arrival === 0 ? a.priority - b.priority : 0) || a.order - b.order);
  const waits = [];
  let startedWithinHorizon = 0;
  let peakQueue = waiting.length;
  let arrivalsSeen = 0;
  for (const job of jobs) {
    arrivalsSeen += 1;
    if (!servers.length) continue;
    let serverIndex = 0;
    for (let candidate = 1; candidate < servers.length; candidate += 1) { if (servers[candidate] < servers[serverIndex]) serverIndex = candidate; }
    const startAt = Math.max(job.arrival, servers[serverIndex]);
    const wait = Math.max(0, startAt - job.arrival);
    const service = drawServiceTime();
    const finishAt = startAt + service;
    servers[serverIndex] = finishAt;
    totalBusyMinutes += service;
    waits.push(wait);
    if (startAt <= horizon) startedWithinHorizon += 1;
    if (finishAt <= horizon) completionTimes.push(finishAt);
    peakQueue = Math.max(peakQueue, Math.max(0, arrivalsSeen - startedWithinHorizon));
  }
  const completed = completionTimes.filter(value => value <= horizon).length;
  const utilisation = servers.length ? Math.min(100, Number((totalBusyMinutes / (servers.length * horizon) * 100).toFixed(1))) : null;
  const quality = serviceDurations.length >= 30 ? 'OBSERVATION_BASED' : (serviceDurations.length ? 'LIMITED_OBSERVATIONS' : 'DEFAULT_ASSUMPTION');
  return {
    model_version: MODEL_VERSION, horizon_minutes: horizon, queue_at_start: waiting.length + activeConsultations, projected_arrivals: arrivals,
    available_servers: serverCount, projected_completed: completed,
    projected_remaining: Math.max(0, waiting.length + activeConsultations + arrivals - completed),
    projected_starts: startedWithinHorizon,
    mean_additional_wait_minutes: waits.length ? Number((waits.reduce((sum, value) => sum + value, 0) / waits.length).toFixed(1)) : null,
    p50_additional_wait_minutes: percentile(waits, 0.5), p90_additional_wait_minutes: percentile(waits, 0.9),
    peak_queue_estimate: Math.min(waiting.length + arrivals, peakQueue), server_utilisation_percent: utilisation,
    estimated_queue_over_60_minutes: waits.filter(value => value > 60).length, model_quality: quality, service_samples_used: serviceDurations.length,
    assumptions: [
      'This is operational planning support, not a clinical triage or diagnosis tool.',
      'Existing waiting work is ordered by the configured priority tier and queue age; simulated future arrivals use tier 4 until clinically triaged.',
      'Current consultations have an estimated half-service-time remaining because exact remaining duration is not observable.',
      serviceDurations.length ? 'Service times are sampled from recent completed visits without exposing patient identity.' : 'No sufficient service-time history was available; bounded synthetic durations around the configured mean are used.',
      'Results are scenarios, not guarantees. Real outcomes depend on arrivals, staffing, resource availability and clinical work.'
    ]
  };
}

function runSyntheticLab(input = {}) {
  const replications = integerInRange(input.replications, 30, 1, 200, 'replications');
  const hours = integerInRange(input.hours, 8, 4, 12, 'hours');
  const arrivalsPerHour = integerInRange(input.arrivals_per_hour, 12, 0, 60, 'arrivals_per_hour');
  const servers = integerInRange(input.servers, 2, 1, 20, 'servers');
  const meanService = Number(input.mean_service_minutes === undefined ? 12 : input.mean_service_minutes);
  if (!Number.isFinite(meanService) || meanService < 3 || meanService > 90) {
    throw Object.assign(new Error('mean_service_minutes must be between 3 and 90.'), { status: 400 });
  }
  const seed = integerInRange(input.seed, 20261015, 1, 2147483647, 'seed');
  const results = [];
  for (let iteration = 0; iteration < replications; iteration += 1) {
    results.push(runClinicSimulation({ waiting: [], in_consultation: 0, extra_arrivals: arrivalsPerHour * hours, servers, horizon_minutes: hours * 60, mean_service_minutes: meanService, seed: (seed + iteration * 7919) % 2147483647 || 1 }));
  }
  const avg = key => Number((results.reduce((sum, result) => sum + (Number(result[key]) || 0), 0) / results.length).toFixed(1));
  return {
    model_version: MODEL_VERSION, input: { replications, hours, arrivals_per_hour: arrivalsPerHour, servers, mean_service_minutes: meanService, seed },
    summary: { average_projected_completed: avg('projected_completed'), average_projected_remaining: avg('projected_remaining'),
      median_p90_additional_wait_minutes: percentile(results.map(result => result.p90_additional_wait_minutes || 0), 0.5),
      worst_p90_additional_wait_minutes: Math.max(...results.map(result => result.p90_additional_wait_minutes || 0)),
      replications_over_60_minute_p90: results.filter(result => (result.p90_additional_wait_minutes || 0) > 60).length, model_quality: 'SYNTHETIC_ONLY' },
    results
  };
}

module.exports = { MODEL_VERSION, normalizeScenario, runClinicSimulation, runSyntheticLab, percentile };
