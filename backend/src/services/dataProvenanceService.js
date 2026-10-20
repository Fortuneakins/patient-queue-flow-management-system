const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');

const PROVENANCE_VALUES = Object.freeze(['UNCLASSIFIED', 'OPERATIONAL', 'SYNTHETIC_TEST', 'DEMO']);
const EXCLUDED_FROM_OPERATIONAL_METRICS = Object.freeze(['SYNTHETIC_TEST', 'DEMO']);

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validateProvenance(value) {
  const provenance = String(value || '').trim().toUpperCase();
  if (!PROVENANCE_VALUES.includes(provenance)) {
    throw httpError('Provenance must be UNCLASSIFIED, OPERATIONAL, SYNTHETIC_TEST or DEMO.');
  }
  return provenance;
}

function validateReason(value) {
  const reason = String(value || '').trim();
  if (reason.length < 5 || reason.length > 300) {
    throw httpError('A review reason between 5 and 300 characters is required.');
  }
  return reason;
}

async function listQueueProvenance({ limit = 50, provenance = null } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const params = [];
  let filter = '';
  if (provenance) {
    params.push(validateProvenance(provenance));
    filter = 'WHERE data_provenance = $1';
  }
  params.push(safeLimit);
  const [records, counts] = await Promise.all([
    query(
      'SELECT queue_id, ticket_number, ticket_date, status, COALESCE(priority_level,4)::int AS priority_level, ' +
      'data_provenance, data_provenance_note, provenance_updated_at, queued_at, called_at, discharged_at ' +
      'FROM queue_entries ' + filter + ' ORDER BY queued_at DESC, queue_id DESC LIMIT $' + params.length,
      params
    ),
    query(
      'SELECT data_provenance, COUNT(*)::int AS record_count FROM queue_entries GROUP BY data_provenance'
    )
  ]);
  const summary = { UNCLASSIFIED: 0, OPERATIONAL: 0, SYNTHETIC_TEST: 0, DEMO: 0 };
  for (const row of counts.rows) summary[row.data_provenance] = Number(row.record_count);
  return {
    records: records.rows,
    summary,
    limit: safeLimit,
    provenance_values: PROVENANCE_VALUES,
    excluded_from_operational_metrics: EXCLUDED_FROM_OPERATIONAL_METRICS
  };
}

async function updateQueueProvenance(queueIdValue, input = {}, actorStaffId) {
  const queueId = Number(queueIdValue);
  if (!Number.isSafeInteger(queueId) || queueId < 1) throw httpError('A valid queue visit ID is required.');
  const provenance = validateProvenance(input.provenance);
  const reason = validateReason(input.reason);

  return withTransaction(async client => {
    const current = await client.query(
      'SELECT queue_id, ticket_number, status, data_provenance FROM queue_entries WHERE queue_id = $1 FOR UPDATE',
      [queueId]
    );
    if (!current.rows[0]) throw httpError('Queue visit not found.', 404);
    const visit = current.rows[0];

    if (['SYNTHETIC_TEST', 'DEMO'].includes(provenance) && visit.status !== 'Discharged') {
      throw httpError('Active visits cannot be classified as synthetic or demo data. Complete the visit through the normal workflow first, then review its provenance.', 409);
    }

    const updated = await client.query(
      'UPDATE queue_entries SET data_provenance=$1, data_provenance_note=$2, provenance_updated_by_staff_id=$3, provenance_updated_at=NOW() ' +
      'WHERE queue_id=$4 RETURNING queue_id, ticket_number, ticket_date, status, COALESCE(priority_level,4)::int AS priority_level, ' +
      'data_provenance, data_provenance_note, provenance_updated_by_staff_id, provenance_updated_at, queued_at, called_at, discharged_at',
      [provenance, reason, actorStaffId, queueId]
    );
    await appendOperationalEvent(client, {
      eventType: 'QUEUE_DATA_PROVENANCE_UPDATED',
      entityType: 'QUEUE_VISIT',
      entityId: queueId,
      actorStaffId,
      fromState: visit.data_provenance,
      toState: provenance,
      metadata: {
        ticket_number: visit.ticket_number,
        previous_provenance: visit.data_provenance,
        new_provenance: provenance,
        reason
      }
    });
    return updated.rows[0];
  });
}

module.exports = { PROVENANCE_VALUES, EXCLUDED_FROM_OPERATIONAL_METRICS, listQueueProvenance, updateQueueProvenance };
