const { query } = require('../db/pool');
const { MODEL_VERSION } = require('../utils/flowSimulation');
function requiredText(value, label, min, max) {
  const clean = String(value || '').trim();
  if (clean.length < min || clean.length > max) throw Object.assign(new Error(label + ' must contain between ' + min + ' and ' + max + ' characters.'), { status: 400 });
  return clean;
}
async function getOverview() {
  const counts = await query(
    "SELECT COUNT(*) FILTER (WHERE status = 'Waiting')::int AS waiting, " +
    "COUNT(*) FILTER (WHERE status = 'In-Consultation')::int AS in_consultation, " +
    "COUNT(*) FILTER (WHERE status = 'Discharged' AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_today, " +
    "ROUND((EXTRACT(EPOCH FROM (NOW() - MIN(queued_at) FILTER (WHERE status = 'Waiting'))) / 60.0)::numeric, 1) AS oldest_wait_minutes, " +
    "COUNT(*) FILTER (WHERE status = 'Waiting' AND queued_at < NOW() - INTERVAL '60 minutes')::int AS overdue_waiting FROM queue_entries WHERE data_provenance NOT IN ('SYNTHETIC_TEST','DEMO')"
  );
  const resources = await query(
    'SELECT resource_type, status, COUNT(*)::int AS resource_count, COALESCE(SUM(capacity),0)::int AS capacity ' +
    'FROM clinic_resources GROUP BY resource_type, status ORDER BY resource_type, status'
  );
  const samples = await query(
    "SELECT COUNT(*)::int AS sample_count FROM queue_entries WHERE status = 'Discharged' AND called_at IS NOT NULL " +
    "AND discharged_at > called_at AND data_provenance = 'OPERATIONAL' AND discharged_at >= NOW() - INTERVAL '90 days'"
  );
  const events = await query('SELECT COUNT(*)::int AS event_count, MAX(created_at) AS last_event_at FROM operational_events');
  return {
    ...counts.rows[0], resources: resources.rows, service_history_samples: samples.rows[0].sample_count,
    event_count: events.rows[0].event_count, last_event_at: events.rows[0].last_event_at,
    model_version: MODEL_VERSION, generated_at: new Date().toISOString()
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
    "SELECT q.queue_id, q.patient_id, p.full_name, q.ticket_number, q.status, q.priority_level, q.queued_at, " +
    "ROUND((EXTRACT(EPOCH FROM (NOW() - q.queued_at)) / 60.0)::numeric, 1) AS elapsed_wait_minutes " +
    "FROM queue_entries q JOIN patients p ON p.patient_id = q.patient_id WHERE q.status IN ('Waiting','In-Consultation') " +
    "AND q.data_provenance NOT IN ('SYNTHETIC_TEST','DEMO') ORDER BY CASE WHEN q.status = 'In-Consultation' THEN 0 ELSE 1 END, COALESCE(q.priority_level,4), q.queued_at"
  );
  return result.rows;
}
module.exports = { getOverview, listEvents, listActiveVisits };
