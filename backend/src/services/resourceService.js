const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');
const RESOURCE_TYPES = ['ROOM', 'EQUIPMENT', 'SERVICE', 'SUPPLY'];
const RESOURCE_STATUSES = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];
function httpError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function positiveId(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw httpError(label + ' must be a positive integer.');
  return parsed;
}
function requiredText(value, label, min, max) {
  const clean = String(value || '').trim();
  if (clean.length < min || clean.length > max) throw httpError(label + ' must contain between ' + min + ' and ' + max + ' characters.');
  return clean;
}
async function listResources() {
  const result = await query(
    'SELECT resource_id, resource_code, name, resource_type, status, capacity, location_label, notes, updated_by_staff_id, created_at, updated_at ' +
    'FROM clinic_resources ORDER BY resource_type, name'
  );
  return result.rows;
}
async function createResource(input, actorStaffId) {
  const code = requiredText(input.resource_code, 'resource_code', 2, 40);
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(code)) throw httpError('resource_code may contain only letters, digits, underscore and hyphen.');
  const name = requiredText(input.name, 'name', 2, 120);
  const type = String(input.resource_type || '').toUpperCase();
  if (!RESOURCE_TYPES.includes(type)) throw httpError('resource_type is invalid.');
  const capacity = Number(input.capacity === undefined ? 1 : input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw httpError('capacity must be an integer between 1 and 100.');
  const location = input.location_label ? requiredText(input.location_label, 'location_label', 2, 120) : null;
  const notes = String(input.notes || '').trim();
  if (notes.length > 500) throw httpError('notes may not exceed 500 characters. Do not put patient details in resource notes.');
  try {
    return await withTransaction(async client => {
      const result = await client.query(
        'INSERT INTO clinic_resources (resource_code, name, resource_type, capacity, location_label, notes, updated_by_staff_id) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [code, name, type, capacity, location, notes, actorStaffId]
      );
      const resource = result.rows[0];
      await appendOperationalEvent(client, { eventType: 'RESOURCE_CREATED', entityType: 'CLINIC_RESOURCE', entityId: resource.resource_id, actorStaffId, toState: resource.status, metadata: { resource_code: resource.resource_code, resource_type: type, capacity } });
      return resource;
    });
  } catch (error) {
    if (error.code === '23505') throw httpError('A resource with this code already exists.', 409);
    throw error;
  }
}
async function updateResourceStatus(resourceId, statusInput, actorStaffId, client = null) {
  const id = positiveId(resourceId, 'resource_id');
  const status = String(statusInput || '').toUpperCase();
  if (!RESOURCE_STATUSES.includes(status)) throw httpError('status must be AVAILABLE, LIMITED or UNAVAILABLE.');
  const work = async db => {
    const currentResult = await db.query('SELECT resource_id, resource_code, status, capacity FROM clinic_resources WHERE resource_id = $1 FOR UPDATE', [id]);
    const current = currentResult.rows[0];
    if (!current) throw httpError('Resource not found.', 404);
    if (current.status === status) return { resource_id: id, resource_code: current.resource_code, status, capacity: current.capacity, unchanged: true };
    const updated = await db.query(
      'UPDATE clinic_resources SET status = $1, updated_by_staff_id = $2, updated_at = NOW() WHERE resource_id = $3 ' +
      'RETURNING resource_id, resource_code, name, resource_type, status, capacity, location_label, notes, updated_at',
      [status, actorStaffId, id]
    );
    await appendOperationalEvent(db, { eventType: 'RESOURCE_STATUS_CHANGED', entityType: 'CLINIC_RESOURCE', entityId: id, actorStaffId, fromState: current.status, toState: status, metadata: { resource_code: current.resource_code } });
    return updated.rows[0];
  };
  return client ? work(client) : withTransaction(work);
}
module.exports = { listResources, createResource, updateResourceStatus, RESOURCE_STATUSES, RESOURCE_TYPES };
