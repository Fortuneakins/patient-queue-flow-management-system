const { query, withTransaction } = require('../db/pool');
const { getOverview } = require('./intelligenceOverviewService');
const { appendOperationalEvent } = require('./operationalEventService');

const ACTION_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];
const CLOSED_STATUSES = ['RESOLVED', 'DISMISSED'];
const STATUS_TRANSITIONS = Object.freeze({
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'DISMISSED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'DISMISSED'],
  IN_PROGRESS: ['RESOLVED', 'DISMISSED'],
  RESOLVED: [],
  DISMISSED: []
});
const ACTION_SELECT = 'SELECT a.action_id, a.source_rule_id, a.severity, a.title, a.summary, ' +
  'a.recommended_action, a.evidence, a.status, a.owner_staff_id, ' +
  'owner.username AS owner_username, owner.role AS owner_role, ' +
  'a.created_by_staff_id, creator.username AS created_by_username, ' +
  'a.updated_by_staff_id, updater.username AS updated_by_username, ' +
  'a.resolved_at, a.created_at, a.updated_at ' +
  'FROM clinic_action_items a ' +
  'LEFT JOIN clinic_staff owner ON owner.staff_id=a.owner_staff_id ' +
  'JOIN clinic_staff creator ON creator.staff_id=a.created_by_staff_id ' +
  'JOIN clinic_staff updater ON updater.staff_id=a.updated_by_staff_id ';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function positiveId(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw httpError(label + ' must be a positive integer.');
  return parsed;
}
function normaliseStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  if (!ACTION_STATUSES.includes(status)) throw httpError('Action status is invalid.');
  return status;
}
async function listActions({ status = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const params = [];
  let filter = '';
  if (status) {
    params.push(normaliseStatus(status));
    filter = 'WHERE a.status=$1';
  }
  params.push(safeLimit);
  const result = await query(
    ACTION_SELECT + filter +
    " ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END, a.updated_at DESC, a.action_id DESC LIMIT $" + params.length,
    params
  );
  return result.rows;
}

async function createFromInsight(ruleIdInput, actorStaffId) {
  const ruleId = String(ruleIdInput || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{2,39}$/.test(ruleId)) throw httpError('A valid system review rule ID is required.');
  const overview = await getOverview();
  const insight = overview.insights.find(item => item.rule_id === ruleId);
  if (!insight) throw httpError('That review prompt is no longer present in the latest operational snapshot. Refresh the snapshot before creating an action.', 409);

  try {
    return await withTransaction(async client => {
      const existing = await client.query(
        "SELECT action_id FROM clinic_action_items WHERE source_rule_id=$1 AND status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') LIMIT 1 FOR UPDATE",
        [ruleId]
      );
      if (existing.rows[0]) {
        const current = await client.query(ACTION_SELECT + ' WHERE a.action_id=$1', [existing.rows[0].action_id]);
        return { ...current.rows[0], already_open: true };
      }

      const inserted = await client.query(
        'INSERT INTO clinic_action_items (source_rule_id,severity,title,summary,recommended_action,evidence,created_by_staff_id,updated_by_staff_id) ' +
        'VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7) RETURNING action_id',
        [ruleId, insight.severity, insight.title, insight.summary, insight.recommended_action, JSON.stringify(insight.evidence || []), actorStaffId]
      );
      const actionId = inserted.rows[0].action_id;
      await appendOperationalEvent(client, {
        eventType: 'OPERATIONAL_ACTION_CREATED',
        entityType: 'CLINIC_ACTION',
        entityId: actionId,
        actorStaffId,
        toState: 'OPEN',
        metadata: { source_rule_id: ruleId, severity: insight.severity }
      });
      const created = await client.query(ACTION_SELECT + ' WHERE a.action_id=$1', [actionId]);
      return { ...created.rows[0], already_open: false };
    });
  } catch (error) {
    if (error.code === '23505') {
      const existing = await query(ACTION_SELECT + " WHERE a.source_rule_id=$1 AND a.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') ORDER BY a.created_at DESC LIMIT 1", [ruleId]);
      if (existing.rows[0]) return { ...existing.rows[0], already_open: true };
    }
    throw error;
  }
}

async function updateAction(actionIdInput, patch = {}, actorStaffId) {
  const actionId = positiveId(actionIdInput, 'action_id');
  const hasStatus = Object.prototype.hasOwnProperty.call(patch, 'status');
  const hasOwner = Object.prototype.hasOwnProperty.call(patch, 'owner_staff_id');
  if (!hasStatus && !hasOwner) throw httpError('Provide status and/or owner_staff_id.');
  const requestedStatus = hasStatus ? normaliseStatus(patch.status) : null;
  let requestedOwner = null;
  if (hasOwner && patch.owner_staff_id !== null && patch.owner_staff_id !== '') {
    requestedOwner = positiveId(patch.owner_staff_id, 'owner_staff_id');
  }

  return withTransaction(async client => {
    const currentResult = await client.query(
      'SELECT action_id,status,owner_staff_id FROM clinic_action_items WHERE action_id=$1 FOR UPDATE',
      [actionId]
    );
    const current = currentResult.rows[0];
    if (!current) throw httpError('Operational action not found.', 404);
    if (CLOSED_STATUSES.includes(current.status)) throw httpError('Resolved or dismissed actions are closed and cannot be changed.', 409);
    if (requestedStatus && requestedStatus !== current.status
        && !STATUS_TRANSITIONS[current.status].includes(requestedStatus)) {
      throw httpError('This action status transition is not permitted.', 409);
    }
    if (hasOwner && requestedOwner !== null) {
      const owner = await client.query('SELECT staff_id FROM clinic_staff WHERE staff_id=$1 AND is_active=TRUE', [requestedOwner]);
      if (!owner.rows[0]) throw httpError('The selected action owner does not exist or is inactive.', 409);
    }
    const nextStatus = requestedStatus || current.status;
    const nextOwner = hasOwner ? requestedOwner : current.owner_staff_id;
    await client.query(
      "UPDATE clinic_action_items SET status=$1, owner_staff_id=$2, updated_by_staff_id=$3, updated_at=NOW(), " +
      "resolved_at=CASE WHEN $1::varchar='RESOLVED' THEN COALESCE(resolved_at,NOW()) ELSE resolved_at END " +
      'WHERE action_id=$4',
      [nextStatus, nextOwner, actorStaffId, actionId]
    );
    await appendOperationalEvent(client, {
      eventType: 'OPERATIONAL_ACTION_UPDATED',
      entityType: 'CLINIC_ACTION',
      entityId: actionId,
      actorStaffId,
      fromState: current.status,
      toState: nextStatus,
      metadata: { owner_staff_id: nextOwner, owner_changed: hasOwner }
    });
    const result = await client.query(ACTION_SELECT + ' WHERE a.action_id=$1', [actionId]);
    return result.rows[0];
  });
}

module.exports = { listActions, createFromInsight, updateAction, ACTION_STATUSES, STATUS_TRANSITIONS };
