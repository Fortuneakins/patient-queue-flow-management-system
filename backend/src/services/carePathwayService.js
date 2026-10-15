const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');

const ROLES = ['RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN'];
const RESOURCE_TYPES = ['ROOM', 'EQUIPMENT', 'SERVICE', 'SUPPLY'];
function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
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
async function logEvent(client, event) {
  return appendOperationalEvent(client, event);
}

async function listPathways() {
  const result = await query(
    "SELECT p.pathway_id, p.pathway_code, p.name, p.description, p.is_active, p.created_at, p.updated_at, " +
    "COALESCE(json_agg(json_build_object('stage_id', s.stage_id, 'stage_code', s.stage_code, 'name', s.name, " +
    "'sequence_no', s.sequence_no, 'required_role', s.required_role, 'resource_type', s.resource_type, 'is_required', s.is_required) " +
    "ORDER BY s.sequence_no) FILTER (WHERE s.stage_id IS NOT NULL), '[]'::json) AS stages " +
    'FROM care_pathways p LEFT JOIN care_pathway_stages s ON s.pathway_id = p.pathway_id ' +
    'GROUP BY p.pathway_id ORDER BY p.is_active DESC, p.name'
  );
  return result.rows;
}

async function createPathway(input, actorStaffId) {
  const code = requiredText(input.pathway_code, 'pathway_code', 3, 40).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(code)) throw httpError('pathway_code must start with a letter and contain only uppercase letters, digits or underscores.');
  const name = requiredText(input.name, 'name', 3, 120);
  const description = String(input.description || '').trim();
  if (description.length > 800) throw httpError('description may not exceed 800 characters.');
  if (!Array.isArray(input.stages) || input.stages.length < 2 || input.stages.length > 15) throw httpError('A pathway must contain between 2 and 15 stages.');
  const seen = new Set();
  const stages = input.stages.map((stage, index) => {
    const stageCode = requiredText(stage.stage_code || ('STAGE_' + (index + 1)), 'stage_code', 2, 40).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(stageCode) || seen.has(stageCode)) throw httpError('Stage codes must be unique and use uppercase letters, digits or underscores.');
    seen.add(stageCode);
    const stageName = requiredText(stage.name, 'stage name', 2, 120);
    const role = stage.required_role ? String(stage.required_role).toUpperCase() : null;
    const resourceType = stage.resource_type ? String(stage.resource_type).toUpperCase() : null;
    if (role && !ROLES.includes(role)) throw httpError('A stage required_role is invalid.');
    if (resourceType && !RESOURCE_TYPES.includes(resourceType)) throw httpError('A stage resource_type is invalid.');
    return { stage_code: stageCode, name: stageName, sequence_no: index + 1, required_role: role, resource_type: resourceType, is_required: stage.is_required !== false };
  });
  try {
    return await withTransaction(async client => {
      const result = await client.query(
        'INSERT INTO care_pathways (pathway_code, name, description, created_by_staff_id) VALUES ($1,$2,$3,$4) ' +
        'RETURNING pathway_id, pathway_code, name, description, is_active, created_at',
        [code, name, description, actorStaffId]
      );
      const pathway = result.rows[0];
      for (const stage of stages) {
        await client.query(
          'INSERT INTO care_pathway_stages (pathway_id, stage_code, name, sequence_no, required_role, resource_type, is_required) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [pathway.pathway_id, stage.stage_code, stage.name, stage.sequence_no, stage.required_role, stage.resource_type, stage.is_required]
        );
      }
      await logEvent(client, { eventType: 'CARE_PATHWAY_CREATED', entityType: 'CARE_PATHWAY', entityId: pathway.pathway_id, actorStaffId, toState: 'ACTIVE', metadata: { pathway_code: code, stage_count: stages.length } });
      return { ...pathway, stages };
    });
  } catch (error) {
    if (error.code === '23505') throw httpError('A pathway with this code or an identical stage already exists.', 409);
    throw error;
  }
}

async function getJourney(queueId) {
  const id = positiveId(queueId, 'queue_id');
  const visit = await query(
    'SELECT q.queue_id, q.ticket_number, q.status AS visit_status, q.care_pathway_id, p.full_name ' +
    'FROM queue_entries q JOIN patients p ON p.patient_id = q.patient_id WHERE q.queue_id = $1',
    [id]
  );
  if (!visit.rows[0]) throw httpError('Queue entry not found.', 404);
  if (!visit.rows[0].care_pathway_id) return { visit: visit.rows[0], pathway: null, stages: [] };
  const pathway = await query('SELECT pathway_id, pathway_code, name, description FROM care_pathways WHERE pathway_id = $1', [visit.rows[0].care_pathway_id]);
  const stages = await query(
    'SELECT s.stage_id, s.stage_code, s.name, s.sequence_no, s.required_role, s.resource_type, s.is_required, ' +
    "COALESCE(p.status, CASE WHEN s.sequence_no = 1 THEN 'READY' ELSE 'PENDING' END) AS status, " +
    'p.block_reason, p.started_at, p.completed_at, p.updated_at ' +
    'FROM care_pathway_stages s LEFT JOIN queue_pathway_progress p ON p.stage_id = s.stage_id AND p.queue_id = $1 ' +
    'WHERE s.pathway_id = $2 ORDER BY s.sequence_no',
    [id, visit.rows[0].care_pathway_id]
  );
  return { visit: visit.rows[0], pathway: pathway.rows[0] || null, stages: stages.rows };
}

async function assignPathway(queueId, pathwayId, actorStaffId) {
  const qid = positiveId(queueId, 'queue_id');
  const pid = positiveId(pathwayId, 'pathway_id');
  return withTransaction(async client => {
    const visitResult = await client.query('SELECT queue_id, status, care_pathway_id FROM queue_entries WHERE queue_id = $1 FOR UPDATE', [qid]);
    const visit = visitResult.rows[0];
    if (!visit) throw httpError('Queue entry not found.', 404);
    if (visit.status === 'Discharged') throw httpError('A discharged visit cannot be assigned a new pathway.', 409);
    const pathwayResult = await client.query('SELECT pathway_id, pathway_code, is_active FROM care_pathways WHERE pathway_id = $1', [pid]);
    const pathway = pathwayResult.rows[0];
    if (!pathway || !pathway.is_active) throw httpError('Active care pathway not found.', 404);
    if (visit.care_pathway_id && Number(visit.care_pathway_id) !== pid) {
      const progress = await client.query("SELECT COUNT(*)::int AS count FROM queue_pathway_progress WHERE queue_id = $1 AND status <> 'PENDING'", [qid]);
      if (progress.rows[0].count > 0) throw httpError('A pathway with started progress cannot be replaced.', 409);
      await client.query('DELETE FROM queue_pathway_progress WHERE queue_id = $1', [qid]);
    }
    await client.query('UPDATE queue_entries SET care_pathway_id = $1 WHERE queue_id = $2', [pid, qid]);
    await client.query(
      "INSERT INTO queue_pathway_progress (queue_id, stage_id, status) " +
      "SELECT $1, s.stage_id, CASE WHEN s.sequence_no = (SELECT MIN(sequence_no) FROM care_pathway_stages WHERE pathway_id = $2) THEN 'READY' ELSE 'PENDING' END " +
      'FROM care_pathway_stages s WHERE s.pathway_id = $2 ON CONFLICT (queue_id, stage_id) DO NOTHING',
      [qid, pid]
    );
    await logEvent(client, { eventType: 'CARE_PATHWAY_ASSIGNED', entityType: 'QUEUE_VISIT', entityId: qid, actorStaffId, toState: pathway.pathway_code, metadata: { pathway_id: pid } });
    return { queue_id: qid, pathway_id: pid, pathway_code: pathway.pathway_code };
  });
}

async function updateJourneyStage(queueId, stageId, input, actorStaffId, actorRole) {
  const qid = positiveId(queueId, 'queue_id');
  const sid = positiveId(stageId, 'stage_id');
  const status = String(input.status || '').toUpperCase();
  if (!['READY', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'].includes(status)) throw httpError('Stage status must be READY, IN_PROGRESS, COMPLETED or BLOCKED.');
  const reason = String(input.block_reason || '').trim();
  if (reason.length > 300) throw httpError('block_reason may not exceed 300 characters.');
  if (status === 'BLOCKED' && reason.length < 3) throw httpError('A short reason is required to block a stage.');
  return withTransaction(async client => {
    const result = await client.query(
      'SELECT p.progress_id, p.queue_id, p.stage_id, p.status, s.sequence_no, s.name, s.required_role, s.is_required, q.status AS visit_status ' +
      'FROM queue_pathway_progress p JOIN care_pathway_stages s ON s.stage_id = p.stage_id ' +
      'JOIN queue_entries q ON q.queue_id = p.queue_id WHERE p.queue_id = $1 AND p.stage_id = $2 FOR UPDATE OF p',
      [qid, sid]
    );
    const row = result.rows[0];
    if (!row) throw httpError('Assigned pathway stage not found.', 404);
    if (row.visit_status === 'Discharged') throw httpError('A discharged visit pathway is read-only.', 409);
    if (row.required_role && row.required_role !== actorRole && actorRole !== 'ADMIN') throw httpError('This pathway stage is restricted to the ' + row.required_role + ' role.', 403);
    if (status === 'IN_PROGRESS' && !['READY', 'IN_PROGRESS'].includes(row.status)) throw httpError('Only a ready stage can be started.', 409);
    if (status === 'COMPLETED' && row.status !== 'IN_PROGRESS') throw httpError('Only an in-progress stage can be completed.', 409);
    if (status === 'READY' && !['PENDING', 'BLOCKED', 'READY'].includes(row.status)) throw httpError('This stage cannot return to READY after completion or start.', 409);
    if (status === 'READY' || status === 'IN_PROGRESS') {
      const predecessors = await client.query(
        "SELECT COUNT(*)::int AS incomplete FROM queue_pathway_progress p JOIN care_pathway_stages s ON s.stage_id = p.stage_id " +
        "WHERE p.queue_id = $1 AND s.sequence_no < $2 AND s.is_required = TRUE AND p.status <> 'COMPLETED'",
        [qid, row.sequence_no]
      );
      if (predecessors.rows[0].incomplete > 0) throw httpError('Complete all required earlier stages before progressing.', 409);
    }
    const updated = await client.query(
      "UPDATE queue_pathway_progress SET status = $1::varchar(20), block_reason = $2, " +
      "started_at = CASE WHEN $1::varchar(20) = 'IN_PROGRESS' AND started_at IS NULL THEN NOW() WHEN $1 = 'READY' THEN NULL ELSE started_at END, " +
      "completed_at = CASE WHEN $1::varchar(20) = 'COMPLETED' THEN NOW() ELSE NULL END, updated_by_staff_id = $3, updated_at = NOW() " +
      'WHERE progress_id = $4 RETURNING progress_id, queue_id, stage_id, status, block_reason, started_at, completed_at, updated_at',
      [status, status === 'BLOCKED' ? reason : null, actorStaffId, row.progress_id]
    );
    if (status === 'COMPLETED') {
      await client.query(
        "UPDATE queue_pathway_progress p SET status = 'READY', updated_at = NOW() " +
        'FROM care_pathway_stages next_stage WHERE p.queue_id = $1 AND p.stage_id = next_stage.stage_id ' +
        "AND next_stage.sequence_no = $2 AND p.status = 'PENDING' AND NOT EXISTS (" +
        'SELECT 1 FROM queue_pathway_progress earlier JOIN care_pathway_stages earlier_stage ON earlier_stage.stage_id = earlier.stage_id ' +
        "WHERE earlier.queue_id = p.queue_id AND earlier_stage.sequence_no < next_stage.sequence_no AND earlier_stage.is_required = TRUE AND earlier.status <> 'COMPLETED')",
        [qid, row.sequence_no + 1]
      );
    }
    await logEvent(client, { eventType: 'CARE_PATHWAY_STAGE_UPDATED', entityType: 'QUEUE_PATHWAY_STAGE', entityId: row.progress_id, actorStaffId, fromState: row.status, toState: status, metadata: { queue_id: qid, stage_name: row.name, has_block_reason: status === 'BLOCKED' } });
    return updated.rows[0];
  });
}

module.exports = { listPathways, createPathway, getJourney, assignPathway, updateJourneyStage, RESOURCE_TYPES };
