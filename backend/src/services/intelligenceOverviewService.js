const { query } = require('../db/pool');
const { MODEL_VERSION } = require('../utils/flowSimulation');
const env = require('../config/env');
const { queueVisibilityPredicate } = require('../config/dataProvenancePolicy');
const { buildClinicInsights } = require('./clinicInsightEngine');
const queueVisibility = queueVisibilityPredicate(env.DATA_PROVENANCE_MODE, 'q');

function requiredText(value, label, min, max) {
  const clean = String(value || '').trim();
  if (clean.length < min || clean.length > max) throw Object.assign(new Error(label + ' must contain between ' + min + ' and ' + max + ' characters.'), { status: 400 });
  return clean;
}

async function getOverview() {
  const generatedAt = new Date().toISOString();
  const [counts, resources, samples, events, provenance, staffing] = await Promise.all([
    query(
      "SELECT COUNT(*) FILTER (WHERE status = 'Waiting')::int AS waiting, " +
      "COUNT(*) FILTER (WHERE status = 'In-Consultation')::int AS in_consultation, " +
      "COUNT(*) FILTER (WHERE status = 'Discharged' AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_today, " +
      "ROUND((EXTRACT(EPOCH FROM (NOW() - MIN(queued_at) FILTER (WHERE status = 'Waiting'))) / 60.0)::numeric, 1) AS oldest_wait_minutes, " +
      "COUNT(*) FILTER (WHERE status = 'Waiting' AND queued_at < NOW() - ($1::int * INTERVAL '1 minute'))::int AS overdue_waiting " +
      "FROM queue_entries q WHERE " + queueVisibility,
      [env.DELAY_REVIEW_THRESHOLD_MINUTES]
    ),
    query(
      'SELECT resource_type, status, COUNT(*)::int AS resource_count, COALESCE(SUM(capacity),0)::int AS capacity ' +
      'FROM clinic_resources GROUP BY resource_type, status ORDER BY resource_type, status'
    ),
    query(
      "SELECT COUNT(*)::int AS sample_count FROM (" +
      "SELECT queue_id FROM queue_entries WHERE status = 'Discharged' AND called_at IS NOT NULL " +
      "AND discharged_at IS NOT NULL AND discharged_at > called_at AND data_provenance = 'OPERATIONAL' " +
      "AND discharged_at >= NOW() - INTERVAL '90 days' " +
      "AND EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0 BETWEEN 1 AND 240 " +
      "ORDER BY discharged_at DESC LIMIT 500) eligible_service_samples"
    ),
    query('SELECT COUNT(*)::int AS event_count, MAX(created_at) AS last_event_at FROM operational_events'),
    query(
      "SELECT COUNT(*) FILTER (WHERE status = 'Discharged' AND data_provenance = 'UNCLASSIFIED')::int AS unclassified_completed, " +
      "COUNT(*) FILTER (WHERE status IN ('Waiting','In-Consultation') AND data_provenance = 'UNCLASSIFIED')::int AS unclassified_active, " +
      "COUNT(*) FILTER (WHERE data_provenance IN ('SYNTHETIC_TEST','DEMO'))::int AS excluded_test_demo " +
      "FROM queue_entries"
    ),
    query(
      "SELECT COUNT(DISTINCT s.staff_id)::int AS on_duty_doctors " +
      "FROM shifts s JOIN clinic_staff cs ON cs.staff_id=s.staff_id " +
      "WHERE cs.role='DOCTOR' AND cs.is_active=TRUE " +
      "AND s.shift_date=(NOW() AT TIME ZONE 'Africa/Johannesburg')::date " +
      "AND (NOW() AT TIME ZONE 'Africa/Johannesburg')::time BETWEEN s.start_time AND s.end_time"
    )
  ]);

  const countRow = counts.rows[0];
  const resourceRows = resources.rows;
  const resourceIssues = resourceRows
    .filter(item => ['LIMITED', 'UNAVAILABLE'].includes(String(item.status).toUpperCase()))
    .reduce((sum, item) => sum + Number(item.resource_count || 0), 0);
  const provenanceRow = provenance.rows[0];
  const staffedDoctors = Number(staffing.rows[0].on_duty_doctors);
  const sampleCount = Number(samples.rows[0].sample_count);
  const insightSnapshot = {
    waiting: countRow.waiting,
    in_consultation: countRow.in_consultation,
    overdue_waiting: countRow.overdue_waiting,
    oldest_wait_minutes: countRow.oldest_wait_minutes,
    on_duty_doctors: staffedDoctors,
    resource_issues: resourceIssues,
    unclassified_completed: Number(provenanceRow.unclassified_completed),
    unclassified_active: Number(provenanceRow.unclassified_active),
    service_history_samples: sampleCount,
    delay_review_threshold_minutes: env.DELAY_REVIEW_THRESHOLD_MINUTES,
    generated_at: generatedAt
  };
  const insightResult = buildClinicInsights(insightSnapshot);

  return {
    ...countRow,
    resources: resourceRows,
    service_history_samples: sampleCount,
    event_count: events.rows[0].event_count,
    last_event_at: events.rows[0].last_event_at,
    model_version: MODEL_VERSION,
    delay_review_threshold_minutes: env.DELAY_REVIEW_THRESHOLD_MINUTES,
    generated_at: generatedAt,
    staffing: { on_duty_doctors: staffedDoctors, source: 'ROSTERED_ACTIVE_SHIFTS' },
    data_quality: {
      unclassified_completed: Number(provenanceRow.unclassified_completed),
      unclassified_active: Number(provenanceRow.unclassified_active),
      excluded_test_demo_records: Number(provenanceRow.excluded_test_demo),
      historical_service_samples: sampleCount
    },
    insights: insightResult.insights,
    insight_model_version: insightResult.model_version,
    insight_generated_at: insightResult.generated_at,
    insight_source: insightResult.source,
    decision_boundary: insightResult.decision_boundary
  };
}

async function listEvents({ limit = 100, eventType = null } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const params = [];
  let filter = '';
  if (eventType) {
    filter = 'WHERE event_type = $1';
    params.push(requiredText(eventType, 'event_type', 3, 60));
  }
  params.push(safeLimit);
  const result = await query(
    'SELECT event_id, event_type, entity_type, entity_id, actor_staff_id, from_state, to_state, metadata, created_at ' +
    'FROM operational_events ' + filter + ' ORDER BY created_at DESC, event_id DESC LIMIT $' + params.length,
    params
  );
  return result.rows;
}
async function listActiveVisits() {
  const result = await query(
    `SELECT q.queue_id, q.patient_id, p.full_name, q.ticket_number, q.status, q.priority_level, q.queued_at,
            ROUND((EXTRACT(EPOCH FROM (NOW() - q.queued_at)) / 60.0)::numeric, 1) AS elapsed_wait_minutes
     FROM queue_entries q JOIN patients p ON p.patient_id = q.patient_id
     WHERE q.status IN ('Waiting','In-Consultation') AND ${queueVisibility}
     ORDER BY CASE WHEN q.status = 'In-Consultation' THEN 0 ELSE 1 END, COALESCE(q.priority_level,4), q.queued_at`
  );
  return result.rows;
}
module.exports = { getOverview, listEvents, listActiveVisits };
