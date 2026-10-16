const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');
const { MODEL_VERSION, normalizeScenario, runClinicSimulation, runSyntheticLab } = require('../utils/flowSimulation');
const env = require('../config/env');
function httpError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function positiveMinutes(value, label, min = 0, max = 1440) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw httpError(label + ' must be between ' + min + ' and ' + max + ' minutes.');
  return Number(number.toFixed(2));
}
async function currentSnapshot() {
  const queueResult = await query(
    "SELECT queue_id, status, priority_level, queued_at, GREATEST(0, EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60.0) AS waiting_minutes " +
    "FROM queue_entries WHERE status IN ('Waiting','In-Consultation') ORDER BY COALESCE(priority_level,4), queued_at LIMIT 1000"
  );
  const waiting = queueResult.rows.filter(row => row.status === 'Waiting').map(row => ({
    priority_level: row.priority_level || 4, queued_at: row.queued_at, waiting_minutes: Number(row.waiting_minutes)
  }));
  const activeConsultations = queueResult.rows.filter(row => row.status === 'In-Consultation').length;
  const durationResult = await query(
    "SELECT ROUND((EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0)::numeric,2) AS minutes " +
    "FROM queue_entries WHERE status = 'Discharged' AND called_at IS NOT NULL AND discharged_at > called_at " +
    "AND discharged_at >= NOW() - INTERVAL '90 days' ORDER BY discharged_at DESC LIMIT 500"
  );
  const durations = durationResult.rows.map(row => Number(row.minutes)).filter(value => Number.isFinite(value) && value >= 1 && value <= 240);
  const meanService = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 12;
  const duty = await query(
    "SELECT COUNT(DISTINCT s.staff_id)::int AS on_duty FROM shifts s JOIN clinic_staff cs ON cs.staff_id = s.staff_id " +
    "WHERE cs.role = 'DOCTOR' AND cs.is_active = TRUE AND s.shift_date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date " +
    "AND (NOW() AT TIME ZONE 'Africa/Johannesburg')::time BETWEEN s.start_time AND s.end_time"
  );
  const resources = await query(
    "SELECT COUNT(*)::int AS room_rows, COALESCE(SUM(CASE WHEN status = 'AVAILABLE' THEN capacity WHEN status = 'LIMITED' THEN GREATEST(1, CEIL(capacity / 2.0)::int) ELSE 0 END),0)::int AS room_capacity " +
    "FROM clinic_resources WHERE resource_type = 'ROOM'"
  );
  const doctors = Number(duty.rows[0].on_duty);
  const room = resources.rows[0];
  let servers = doctors > 0 ? doctors : env.STAFFED_STATIONS;
  if (Number(room.room_rows) > 0) servers = Math.min(servers, Number(room.room_capacity));
  return {
    waiting, in_consultation: activeConsultations, servers: Math.max(0, Math.min(50, servers)),
    configured_servers: env.STAFFED_STATIONS, on_duty_doctors: doctors,
    room_capacity: Number(room.room_rows) > 0 ? Number(room.room_capacity) : null,
    mean_service_minutes: Number(meanService.toFixed(2)), service_durations: durations, service_samples: durations.length
  };
}
function compareResults(baseline, scenario) {
  const delta = key => baseline[key] === null || scenario[key] === null ? null : Number((scenario[key] - baseline[key]).toFixed(1));
  return {
    projected_completed_delta: delta('projected_completed'),
    projected_remaining_delta: delta('projected_remaining'),
    mean_additional_wait_delta_minutes: delta('mean_additional_wait_minutes'),
    p90_additional_wait_delta_minutes: delta('p90_additional_wait_minutes'),
    server_utilisation_delta_percentage_points: delta('server_utilisation_percent')
  };
}
async function runScenario(input, actorStaffId) {
  const scenarioInput = normalizeScenario(input);
  const snapshot = await currentSnapshot();
  const shared = {
    waiting: snapshot.waiting, in_consultation: snapshot.in_consultation,
    mean_service_minutes: snapshot.mean_service_minutes, service_durations: snapshot.service_durations,
    seed: scenarioInput.seed, horizon_minutes: scenarioInput.horizon_minutes
  };
  const baseline = runClinicSimulation({ ...shared, servers: snapshot.servers, extra_arrivals: 0, doctor_delay_minutes: 0 });
  const scenarioServers = Math.max(0, Math.min(50, snapshot.servers + scenarioInput.additional_stations - scenarioInput.station_loss));
  const scenario = runClinicSimulation({ ...shared, servers: scenarioServers, extra_arrivals: scenarioInput.extra_arrivals, doctor_delay_minutes: scenarioInput.doctor_delay_minutes });
  const output = {
    model_version: MODEL_VERSION, baseline, scenario, comparison: compareResults(baseline, scenario),
    context: { on_duty_doctors: snapshot.on_duty_doctors, configured_servers: snapshot.configured_servers, room_capacity: snapshot.room_capacity, historical_service_samples: snapshot.service_samples },
    human_review_required: true, automatic_actions_taken: false
  };
  const name = String(input.name || 'FlowTwin scenario').trim().slice(0, 120) || 'FlowTwin scenario';
  const stored = await withTransaction(async client => {
    const result = await client.query(
      "INSERT INTO flow_simulations (simulation_kind,name,model_version,seed,input,output,created_by_staff_id) VALUES ('SCENARIO',$1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING simulation_id,created_at",
      [name, MODEL_VERSION, scenarioInput.seed, JSON.stringify(scenarioInput), JSON.stringify(output), actorStaffId]
    );
    await appendOperationalEvent(client, { eventType: 'FLOWTWIN_SIMULATION_RUN', entityType: 'FLOW_SIMULATION', entityId: result.rows[0].simulation_id, actorStaffId, toState: 'COMPLETED', metadata: { name, horizon_minutes: scenarioInput.horizon_minutes, model_version: MODEL_VERSION } });
    return result.rows[0];
  });
  return { ...stored, name, input: scenarioInput, ...output };
}
async function listSimulations(limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await query('SELECT simulation_id,simulation_kind,name,model_version,seed,input,output,created_at FROM flow_simulations ORDER BY created_at DESC LIMIT $1', [safeLimit]);
  return result.rows;
}
const BENCHMARKS = [
  { code: 'SMALL_RURAL', name: 'Small rural clinic', arrivals_per_hour: 8, servers: 1, mean_service_minutes: 14, provenance: 'SYNTHETIC_REFERENCE_ONLY' },
  { code: 'GENERAL_OPD', name: 'General outpatient clinic', arrivals_per_hour: 12, servers: 2, mean_service_minutes: 12, provenance: 'SYNTHETIC_REFERENCE_ONLY' },
  { code: 'HIGH_DEMAND', name: 'High-demand clinic', arrivals_per_hour: 20, servers: 3, mean_service_minutes: 11, provenance: 'SYNTHETIC_REFERENCE_ONLY' }
];
function listBenchmarkProfiles() { return BENCHMARKS; }
async function runLab(input, actorStaffId) {
  const snapshot = await currentSnapshot();
  const labInput = { ...input };
  if (labInput.mean_service_minutes === undefined) labInput.mean_service_minutes = snapshot.mean_service_minutes;
  const result = runSyntheticLab(labInput);
  const persisted = { model_version: result.model_version, input: result.input, summary: result.summary };
  const stored = await withTransaction(async client => {
    const row = await client.query(
      "INSERT INTO flow_simulations (simulation_kind,name,model_version,seed,input,output,created_by_staff_id) VALUES ('SYNTHETIC_BATCH',$1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING simulation_id,created_at",
      ['Synthetic clinic laboratory', result.model_version, result.input.seed, JSON.stringify(result.input), JSON.stringify(persisted), actorStaffId]
    );
    await appendOperationalEvent(client, { eventType: 'SYNTHETIC_LAB_RUN', entityType: 'FLOW_SIMULATION', entityId: row.rows[0].simulation_id, actorStaffId, toState: 'COMPLETED', metadata: { replications: result.input.replications, model_version: result.model_version } });
    return row.rows[0];
  });
  return { ...stored, ...persisted };
}
async function recordForecast(input, actorStaffId) {
  const horizon = Number(input.horizon_minutes === undefined ? 60 : input.horizon_minutes);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 1440) throw httpError('horizon_minutes must be an integer between 1 and 1440.');
  const estimates = input.tier_estimates && typeof input.tier_estimates === 'object' && !Array.isArray(input.tier_estimates) ? input.tier_estimates : {};
  const tierEstimates = {};
  for (let tier = 1; tier <= 4; tier += 1) {
    if (estimates[tier] === undefined) throw httpError('tier_estimates must contain predictions for tiers 1 to 4.');
    tierEstimates[tier] = positiveMinutes(estimates[tier], 'Tier ' + tier + ' estimate');
  }
  const snapshot = await query("SELECT queue_id, COALESCE(priority_level,4)::int AS tier FROM queue_entries WHERE status = 'Waiting' ORDER BY queued_at LIMIT 1000");
  const stored = await withTransaction(async client => {
    const row = await client.query(
      'INSERT INTO flow_forecasts (model_version,horizon_minutes,tier_estimates,waiting_snapshot,created_by_staff_id) VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING forecast_id,created_at',
      [String(input.model_version || MODEL_VERSION).slice(0, 40), horizon, JSON.stringify(tierEstimates), snapshot.rowCount, actorStaffId]
    );
    const forecast = row.rows[0];
    for (const item of snapshot.rows) {
      await client.query(
        'INSERT INTO flow_forecast_samples (forecast_id,queue_id,tier,predicted_wait_minutes) VALUES ($1,$2,$3,$4) ON CONFLICT (forecast_id,queue_id) DO NOTHING',
        [forecast.forecast_id, item.queue_id, item.tier, tierEstimates[item.tier]]
      );
    }
    await appendOperationalEvent(client, { eventType: 'WAIT_FORECAST_RECORDED', entityType: 'FLOW_FORECAST', entityId: forecast.forecast_id, actorStaffId, toState: 'RECORDED', metadata: { waiting_snapshot: snapshot.rowCount, horizon_minutes: horizon } });
    return forecast;
  });
  return { ...stored, horizon_minutes: horizon, waiting_snapshot: snapshot.rowCount, tier_estimates: tierEstimates, tracked_visits: snapshot.rowCount };
}
async function getForecastTruth(limit = 20) {
  await query(
    'UPDATE flow_forecast_samples s SET actual_wait_minutes = GREATEST(0, ROUND((EXTRACT(EPOCH FROM (q.called_at - s.created_at)) / 60.0)::numeric, 2)), observed_at = q.called_at ' +
    "FROM queue_entries q WHERE s.queue_id = q.queue_id AND s.actual_wait_minutes IS NULL AND q.called_at IS NOT NULL AND q.called_at >= s.created_at"
  );
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await query(
    'SELECT f.forecast_id,f.model_version,f.horizon_minutes,f.tier_estimates,f.waiting_snapshot,f.created_at, ' +
    'COUNT(s.sample_id)::int AS tracked_samples,COUNT(s.actual_wait_minutes)::int AS observed_samples, ' +
    'ROUND(AVG(ABS(s.actual_wait_minutes - s.predicted_wait_minutes)) FILTER (WHERE s.actual_wait_minutes IS NOT NULL)::numeric,1) AS mean_absolute_error_minutes ' +
    'FROM flow_forecasts f LEFT JOIN flow_forecast_samples s ON s.forecast_id = f.forecast_id ' +
    'GROUP BY f.forecast_id ORDER BY f.created_at DESC LIMIT $1', [safeLimit]
  );
  return { forecasts: result.rows, methodology: 'Observed elapsed time from queue entry to first consultation call is compared with the per-tier wait estimate captured at forecast time. This is descriptive operational monitoring, not clinical validation.' };
}
async function fairnessMetrics() {
  const result = await query(
    'WITH tiers AS (SELECT generate_series(1,4)::int AS tier), ' +
    "history AS (SELECT COALESCE(priority_level,4)::int AS tier, COUNT(*)::int AS sample_size, " +
    'ROUND(AVG(EXTRACT(EPOCH FROM (called_at - queued_at)) / 60.0)::numeric,1) AS mean_wait_minutes, ' +
    'ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (called_at - queued_at)) / 60.0)::numeric,1) AS p90_wait_minutes ' +
    "FROM queue_entries WHERE status = 'Discharged' AND called_at IS NOT NULL AND called_at >= queued_at AND discharged_at >= NOW() - INTERVAL '30 days' GROUP BY COALESCE(priority_level,4)), " +
    "active AS (SELECT COALESCE(priority_level,4)::int AS tier, COUNT(*) FILTER (WHERE queued_at < NOW() - INTERVAL '60 minutes')::int AS overdue_waiting " +
    "FROM queue_entries WHERE status = 'Waiting' GROUP BY COALESCE(priority_level,4)) " +
    'SELECT t.tier,COALESCE(h.sample_size,0)::int AS sample_size,h.mean_wait_minutes,h.p90_wait_minutes, ' +
    'COALESCE(a.overdue_waiting,0)::int AS overdue_waiting, ' +
    'CASE WHEN COALESCE(a.overdue_waiting,0) > 0 THEN TRUE ELSE FALSE END AS review_required ' +
    'FROM tiers t LEFT JOIN history h ON h.tier=t.tier LEFT JOIN active a ON a.tier=t.tier ORDER BY t.tier'
  );
  return {
    tiers: result.rows, threshold_minutes: 60,
    interpretation: 'This is an operational delay review, not a determination of clinical fairness or discrimination. Small samples and patient complexity can affect comparisons. Staff should review context without automatically changing clinician-assigned priority.'
  };
}
module.exports = { currentSnapshot, runScenario, listSimulations, listBenchmarkProfiles, runLab, recordForecast, getForecastTruth, fairnessMetrics, MODEL_VERSION };
