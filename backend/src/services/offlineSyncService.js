const { withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');
const resourceService = require('./resourceService');
function httpError(message, status = 400) { return Object.assign(new Error(message), { status }); }

async function syncOfflineOperations(actorStaffId, operations) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 50) {
    throw httpError('Provide between 1 and 50 offline resource updates.');
  }
  const results = [];
  for (const operation of operations) {
    const key = String(operation.idempotency_key || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw httpError('Each offline operation requires a valid idempotency_key UUID.');
    }
    if (String(operation.operation_type || '').toUpperCase() !== 'RESOURCE_STATUS') {
      throw httpError('Only RESOURCE_STATUS operations can be synchronised offline.');
    }
    const resourceId = Number(operation.resource_id);
    if (!Number.isInteger(resourceId) || resourceId < 1) throw httpError('resource_id must be a positive integer.');
    const desiredStatus = String(operation.status || '').toUpperCase();
    if (!resourceService.RESOURCE_STATUSES.includes(desiredStatus)) throw httpError('An offline resource status is invalid.');
    const payload = { operation_type: 'RESOURCE_STATUS', resource_id: resourceId, status: desiredStatus };
    const outcome = await withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key]);
      const existing = await client.query(
        'SELECT actor_staff_id, request_payload, response_payload FROM offline_sync_receipts WHERE idempotency_key = $1 FOR UPDATE',
        [key]
      );
      if (existing.rows[0]) {
        const prior = existing.rows[0].request_payload;
        if (Number(existing.rows[0].actor_staff_id) !== Number(actorStaffId) || prior.operation_type !== payload.operation_type || Number(prior.resource_id) !== payload.resource_id || prior.status !== payload.status) {
          throw httpError('The offline idempotency key was already used for a different operation.', 409);
        }
        return { ...existing.rows[0].response_payload, duplicate_replay: true };
      }
      const resource = await resourceService.updateResourceStatus(resourceId, desiredStatus, actorStaffId, client);
      const response = { resource_id: resourceId, status: resource.status, unchanged: Boolean(resource.unchanged), synced: true };
      await client.query(
        "INSERT INTO offline_sync_receipts (idempotency_key, operation_type, resource_id, actor_staff_id, request_payload, response_payload) " +
        "VALUES ($1,'RESOURCE_STATUS',$2,$3,$4::jsonb,$5::jsonb)",
        [key, resourceId, actorStaffId, JSON.stringify(payload), JSON.stringify(response)]
      );
      await appendOperationalEvent(client, {
        eventType: 'OFFLINE_RESOURCE_UPDATE_SYNCED', entityType: 'CLINIC_RESOURCE', entityId: resourceId,
        actorStaffId, toState: desiredStatus, metadata: { idempotency_key: key }
      });
      return response;
    });
    results.push(outcome);
  }
  return { processed: results.length, results };
}
module.exports = { syncOfflineOperations };
