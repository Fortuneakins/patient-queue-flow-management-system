'use strict';

const crypto = require('node:crypto');
const { query, withTransaction } = require('../db/pool');
const { simulateQueue, runSyntheticLab } = require('./simulationEngine');
const smsService = require('./smsService');

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function integer(value, name, min, max, fallback) {
  const resolved = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) throw badRequest(name + ' must be an integer between ' + min + ' and ' + max + '.');
  return resolved;
}
function text(value, name, max, required = true) {
  const resolved = String(value ?? '').trim();
  if (required && !resolved) throw badRequest(name + ' is required.');
  if (resolved.length > max) throw badRequest(name + ' must not exceed ' + max + ' characters.');
  return resolved;
}
function safeTags(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) throw badRequest('service_tags must be an array of at most 12 values.');
  return [...new Set(value.map(v => String(v).trim().toLowerCase()))].filter(Boolean).map(v => {
    if (!/^[a-z0-9_-]{1,40}$/.test(v)) throw badRequest('Each service tag must use letters, numbers, underscores or hyphens.');
    return v;
  });
}
function recordEvent(db, event) {
  const execute = typeof db === 'function' ? db : db.query.bind(db);
  return execute(
    'INSERT INTO operational_events(event_type, entity_type, entity_id, queue_id, actor_staff_id, event_source, details) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [event.eventType, event.entityType, String(event.entityId), event.queueId || null, event.actorStaffId || null, event.source || 'STAFF', JSON.stringify(event.details || {})]
  );
}
function stableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function timestampFilter(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(name + ' must be a valid timestamp.');
  return date.toISOString();
}
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function listEvents({ limit = 100, since, until, eventType, windowHours } = {}) {
  const take = integer(limit, 'limit', 1, 200, 100);
  const from = timestampFilter(since, 'since');
  const to = timestampFilter(until, 'until');
  if (from && to && Date.parse(from) > Date.parse(to)) throw badRequest('since must be earlier than or equal to until.');
  const type = eventType ? text(eventType, 'event_type', 80) : null;
  const hours = windowHours === undefined || windowHours === null || windowHours === '' ? null : integer(windowHours, 'window_hours', 1, 720);
  const result = await query(
    'SELECT event_id, event_type, entity_type, entity_id, queue_id, actor_staff_id, event_source, event_at, details FROM operational_events WHERE ($2::timestamptz IS NULL OR event_at >= $2::timestamptz) AND ($3::timestamptz IS NULL OR event_at <= $3::timestamptz) AND ($4::text IS NULL OR event_type = $4::text) AND ($5::int IS NULL OR event_at >= NOW() - ($5::int * INTERVAL \'1 hour\')) ORDER BY event_at DESC, event_id DESC LIMIT $1',
    [take, from, to, type, hours]
  );
  return result.rows;
}

async function listResources() {
  const result = await query(
    'SELECT resource_id, resource_name, resource_type, status, capacity, service_tags, is_critical, notes, created_at, updated_at FROM clinic_resources ORDER BY resource_type, resource_name'
  );
  return result.rows;
}

async function createResource(input, actorStaffId) {
  const name = text(input.resource_name, 'resource_name', 100);
  const type = String(input.resource_type || '').toUpperCase();
  const status = String(input.status || 'AVAILABLE').toUpperCase();
  const validTypes = ['STATION', 'ROOM', 'EQUIPMENT', 'SUPPLY'];
  const validStatuses = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'MAINTENANCE'];
  if (!validTypes.includes(type)) throw badRequest('resource_type must be STATION, ROOM, EQUIPMENT or SUPPLY.');
  if (!validStatuses.includes(status)) throw badRequest('Invalid resource status.');
  const capacity = integer(input.capacity, 'capacity', 1, 500, 1);
  const tags = safeTags(input.service_tags || []);
  const notes = text(input.notes, 'notes', 300, false);
  return withTransaction(async client => {
    const result = await client.query(
      'INSERT INTO clinic_resources(resource_name, resource_type, status, capacity, service_tags, is_critical, notes, created_by_staff_id, updated_by_staff_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING resource_id, resource_name, resource_type, status, capacity, service_tags, is_critical, notes, created_at, updated_at',
      [name, type, status, capacity, tags, input.is_critical === true, notes || null, actorStaffId]
    );
    const resource = result.rows[0];
    await recordEvent(client, { eventType: 'resource_created', entityType: 'clinic_resource', entityId: resource.resource_id, actorStaffId, details: { resource_type: type, status, capacity, service_tags: tags } });
    return resource;
  }).catch(error => {
    if (error.code === '23505') throw badRequest('A resource with that name already exists.', 409);
    throw error;
  });
}

async function updateResource(resourceId, input, actorStaffId) {
  const id = integer(resourceId, 'resource_id', 1, 2147483647);
  const allowed = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'MAINTENANCE'];
  const status = input.status === undefined ? undefined : String(input.status).toUpperCase();
  if (status !== undefined && !allowed.includes(status)) throw badRequest('Invalid resource status.');
  const capacity = input.capacity === undefined ? undefined : integer(input.capacity, 'capacity', 1, 500);
  const notes = input.notes === undefined ? undefined : text(input.notes, 'notes', 300, false);
  const tags = safeTags(input.service_tags);
  return withTransaction(async client => {
    const before = await client.query('SELECT resource_id, status, capacity, service_tags FROM clinic_resources WHERE resource_id = $1 FOR UPDATE', [id]);
    if (!before.rows[0]) throw badRequest('Resource not found.', 404);
    const result = await client.query(
      'UPDATE clinic_resources SET status = COALESCE($1, status), capacity = COALESCE($2, capacity), service_tags = COALESCE($3, service_tags), notes = CASE WHEN $4::boolean THEN $5 ELSE notes END, updated_by_staff_id = $6, updated_at = NOW() WHERE resource_id = $7 RETURNING resource_id, resource_name, resource_type, status, capacity, service_tags, is_critical, notes, created_at, updated_at',
      [status || null, capacity ?? null, tags ?? null, notes !== undefined, notes ?? null, actorStaffId, id]
    );
    const item = result.rows[0];
    await recordEvent(client, { eventType: 'resource_updated', entityType: 'clinic_resource', entityId: id, actorStaffId, details: { before: before.rows[0], after: { status: item.status, capacity: item.capacity, service_tags: item.service_tags } } });
    return item;
  });
}

async function getOperationalContext() {
  const [queue, resources, staffing, duration] = await Promise.all([
    query("SELECT COUNT(*) FILTER (WHERE status = 'Waiting')::int AS waiting, COUNT(*) FILTER (WHERE status = 'In-Consultation')::int AS in_consultation, COUNT(*) FILTER (WHERE status = 'Discharged' AND discharged_at >= NOW() - INTERVAL '24 hours')::int AS discharged_24h FROM queue_entries"),
    query("SELECT COUNT(*) FILTER (WHERE status = 'AVAILABLE' AND resource_type IN ('STATION','ROOM') AND service_tags && ARRAY['consultation','general']::TEXT[])::int AS consultation_stations, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'UNAVAILABLE')::int AS unavailable FROM clinic_resources"),
    query("SELECT COUNT(DISTINCT s.staff_id)::int AS doctors_on_duty FROM shifts s JOIN clinic_staff cs ON cs.staff_id = s.staff_id WHERE cs.role = 'DOCTOR' AND cs.is_active = TRUE AND s.shift_date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date AND (NOW() AT TIME ZONE 'Africa/Johannesburg')::time BETWEEN s.start_time AND s.end_time"),
    query("SELECT COUNT(*)::int AS sample_size, percentile_cont(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0)::double precision) AS median_service_minutes FROM queue_entries WHERE status = 'Discharged' AND called_at IS NOT NULL AND discharged_at IS NOT NULL AND discharged_at >= NOW() - INTERVAL '90 days' AND discharged_at >= called_at")
  ]);
  const row = queue.rows[0];
  const resourceCount = Number(resources.rows[0].consultation_stations);
  const doctorCount = Number(staffing.rows[0].doctors_on_duty);
  const inventoryFallback = resourceCount < 1;
  const baseStations = Math.max(1, inventoryFallback ? 1 : (doctorCount > 0 ? Math.min(resourceCount, doctorCount) : resourceCount));
  const sampleSize = Number(duration.rows[0].sample_size);
  const observedService = Number(duration.rows[0].median_service_minutes);
  const serviceMinutes = sampleSize >= 5 && Number.isFinite(observedService) && observedService > 0 ? Math.max(1, Math.min(240, Math.round(observedService))) : 15;
  return {
    waiting: Number(row.waiting),
    in_consultation: Number(row.in_consultation),
    discharged_24h: Number(row.discharged_24h),
    consultation_stations_inventory: resourceCount,
    total_resources: Number(resources.rows[0].total),
    unavailable_resources: Number(resources.rows[0].unavailable),
    doctors_on_duty: doctorCount,
    staffed_stations_modelled: baseStations,
    resource_inventory_fallback_used: inventoryFallback,
    service_minutes_modelled: serviceMinutes,
    service_duration_sample_size: sampleSize,
    service_duration_source: sampleSize >= 5 ? 'observed_median_last_90_days' : 'illustrative_15_minute_fallback',
    staffing_schedule_found: doctorCount > 0
  };
}

async function getFairnessSnapshot() {
  const result = await query(
    "SELECT COALESCE(priority_level::TEXT, 'Untriaged') AS priority_group, COUNT(*)::int AS waiting_count, ROUND((MIN(EXTRACT(EPOCH FROM (NOW()-queued_at))/60.0))::numeric,2) AS newest_wait_minutes, ROUND((MAX(EXTRACT(EPOCH FROM (NOW()-queued_at))/60.0))::numeric,2) AS oldest_wait_minutes, ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (NOW()-queued_at))/60.0)::double precision))::numeric,2) AS median_wait_minutes, ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (NOW()-queued_at))/60.0)::double precision))::numeric,2) AS p90_wait_minutes FROM queue_entries WHERE status = 'Waiting' GROUP BY priority_level ORDER BY priority_level NULLS LAST"
  );
  const groups = result.rows.map(row => {
    const count = Number(row.waiting_count);
    const median = Number(row.median_wait_minutes || 0);
    const p90 = Number(row.p90_wait_minutes || 0);
    return { ...row, waiting_count: count, operational_delay_signal: count >= 3 && p90 > Math.max(10, median) * 2 };
  });
  return {
    groups,
    note: 'Operational delay signals identify waiting-time dispersion only. They do not assess clinical urgency, change triage levels or recommend overriding a clinician.'
  };
}

async function getSummary() {
  const [context, resources, fairness, eventCount, referrals] = await Promise.all([
    getOperationalContext(),
    listResources(),
    getFairnessSnapshot(),
    query("SELECT COUNT(*)::int AS count FROM operational_events WHERE event_at >= NOW() - INTERVAL '24 hours'"),
    query('SELECT status, COUNT(*)::int AS count FROM operational_referrals GROUP BY status')
  ]);
  const recent = await query('SELECT event_id, event_type, entity_type, entity_id, actor_staff_id, event_source, event_at, details FROM operational_events ORDER BY event_at DESC, event_id DESC LIMIT 8');
  const referralCounts = {};
  for (const row of referrals.rows) referralCounts[row.status] = Number(row.count);
  return { updated_at: new Date().toISOString(), context, resources, fairness, operational_events_24h: Number(eventCount.rows[0].count), referrals: referralCounts, recent_events: recent.rows };
}

async function listActiveQueue() {
  const result = await query("SELECT queue_id, ticket_number, status, priority_level, queued_at FROM queue_entries WHERE status IN ('Waiting','In-Consultation') ORDER BY CASE WHEN status='In-Consultation' THEN 0 ELSE 1 END, COALESCE(priority_level,4), queued_at ASC LIMIT 200");
  return result.rows;
}

async function listPathways() {
  const result = await query(
    "SELECT t.template_id, t.name, t.description, t.is_active, COALESCE((SELECT jsonb_agg(jsonb_build_object('stage_id', s.stage_id, 'stage_order', s.stage_order, 'stage_code', s.stage_code, 'stage_name', s.stage_name, 'depends_on_stage_codes', s.depends_on_stage_codes, 'required_resource_tags', s.required_resource_tags, 'is_required', s.is_required) ORDER BY s.stage_order) FROM care_pathway_stages s WHERE s.template_id = t.template_id), '[]'::jsonb) AS stages FROM care_pathway_templates t WHERE t.is_active = TRUE ORDER BY t.name"
  );
  return result.rows;
}

async function createPathwayTemplate(input, actorStaffId) {
  const name = text(input.name, 'name', 120);
  const description = text(input.description, 'description', 500, false);
  if (!Array.isArray(input.stages) || input.stages.length < 1 || input.stages.length > 50) {
    throw badRequest('stages must contain between 1 and 50 ordered stages.');
  }
  const stages = input.stages.map((stage, index) => {
    const code = String(stage?.stage_code || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(code)) throw badRequest('Stage ' + (index + 1) + ' has an invalid stage_code.');
    const stageName = text(stage?.stage_name, 'stages[' + (index + 1) + '].stage_name', 120);
    const tags = safeTags(stage?.required_resource_tags || []) || [];
    const dependencies = stage?.depends_on_stage_codes === undefined ? [] : stage.depends_on_stage_codes;
    if (!Array.isArray(dependencies) || dependencies.length > 50) throw badRequest('depends_on_stage_codes must be an array with at most 50 stage codes.');
    const normalizedDependencies = [...new Set(dependencies.map(value => String(value).trim().toUpperCase()))];
    if (normalizedDependencies.some(value => !/^[A-Z][A-Z0-9_]{0,39}$/.test(value))) throw badRequest('Dependency stage codes must use letters, numbers or underscores.');
    if (normalizedDependencies.includes(code)) throw badRequest('A stage cannot depend on itself.');
    const required = stage?.is_required === undefined ? true : stage.is_required;
    if (typeof required !== 'boolean') throw badRequest('is_required must be true or false for every stage.');
    return { stage_order: index + 1, stage_code: code, stage_name: stageName, depends_on_stage_codes: normalizedDependencies, required_resource_tags: tags, is_required: required };
  });
  const codeToOrder = new Map(stages.map(stage => [stage.stage_code, stage.stage_order]));
  if (new Set(stages.map(stage => stage.stage_code)).size !== stages.length) throw badRequest('Stage codes must be unique within a pathway template.');
  for (const stage of stages) {
    for (const dependency of stage.depends_on_stage_codes) {
      const dependencyOrder = codeToOrder.get(dependency);
      if (dependencyOrder === undefined) throw badRequest('Stage ' + stage.stage_code + ' depends on unknown stage ' + dependency + '.');
      if (dependencyOrder >= stage.stage_order) throw badRequest('Stage dependencies must refer to earlier stages in the template; this also prevents dependency cycles.');
    }
  }
  try {
    return await withTransaction(async client => {
      const inserted = await client.query(
        'INSERT INTO care_pathway_templates(name, description, is_active, created_by_staff_id) VALUES ($1,$2,TRUE,$3) RETURNING template_id, name, description, is_active, created_at',
        [name, description, actorStaffId]
      );
      for (const stage of stages) {
        await client.query(
          'INSERT INTO care_pathway_stages(template_id, stage_order, stage_code, stage_name, depends_on_stage_codes, required_resource_tags, is_required) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [inserted.rows[0].template_id, stage.stage_order, stage.stage_code, stage.stage_name, stage.depends_on_stage_codes, stage.required_resource_tags, stage.is_required]
        );
      }
      await recordEvent(client, { eventType: 'pathway_template_created', entityType: 'care_pathway_template', entityId: inserted.rows[0].template_id, actorStaffId, details: { stage_count: stages.length, stage_codes: stages.map(stage => stage.stage_code) } });
      return { ...inserted.rows[0], stages };
    });
  } catch (error) {
    if (error.code === '23505') throw badRequest('A pathway template with that name already exists.', 409);
    throw error;
  }
}

async function listPathwayInstances() {
  const result = await query(
    "SELECT i.instance_id, i.queue_id, q.ticket_number, q.status AS queue_status, i.template_id, t.name AS template_name, i.status, i.created_at, i.completed_at, COALESCE((SELECT jsonb_agg(jsonb_build_object('instance_stage_id', x.instance_stage_id, 'stage_id', s.stage_id, 'stage_order', s.stage_order, 'stage_code', s.stage_code, 'stage_name', s.stage_name, 'depends_on_stage_codes', s.depends_on_stage_codes, 'required_resource_tags', s.required_resource_tags, 'status', x.status, 'started_at', x.started_at, 'completed_at', x.completed_at, 'is_required', s.is_required) ORDER BY s.stage_order) FROM care_pathway_instance_stages x JOIN care_pathway_stages s ON s.stage_id = x.stage_id WHERE x.instance_id = i.instance_id), '[]'::jsonb) AS stages FROM care_pathway_instances i JOIN queue_entries q ON q.queue_id=i.queue_id JOIN care_pathway_templates t ON t.template_id=i.template_id ORDER BY i.created_at DESC LIMIT 100"
  );
  return result.rows;
}

async function openPathway({ queueId, templateId, actorStaffId }) {
  const qid = integer(queueId, 'queue_id', 1, 2147483647);
  const tid = integer(templateId, 'template_id', 1, 2147483647);
  try {
    return await withTransaction(async client => {
      const queue = await client.query("SELECT queue_id, status FROM queue_entries WHERE queue_id=$1 FOR SHARE", [qid]);
      if (!queue.rows[0]) throw badRequest('Queue entry not found.', 404);
      if (queue.rows[0].status === 'Discharged') throw badRequest('A pathway can only be opened for an active visit.', 409);
      const template = await client.query('SELECT template_id, name FROM care_pathway_templates WHERE template_id=$1 AND is_active=TRUE', [tid]);
      if (!template.rows[0]) throw badRequest('Active pathway template not found.', 404);
      const inserted = await client.query('INSERT INTO care_pathway_instances(queue_id, template_id, opened_by_staff_id) VALUES ($1,$2,$3) RETURNING instance_id, queue_id, template_id, status, created_at', [qid, tid, actorStaffId]);
      await client.query('INSERT INTO care_pathway_instance_stages(instance_id, stage_id) SELECT $1, stage_id FROM care_pathway_stages WHERE template_id=$2 ORDER BY stage_order', [inserted.rows[0].instance_id, tid]);
      await recordEvent(client, { eventType: 'pathway_opened', entityType: 'care_pathway_instance', entityId: inserted.rows[0].instance_id, queueId: qid, actorStaffId, details: { template_id: tid, template_name: template.rows[0].name } });
      return inserted.rows[0];
    });
  } catch (error) {
    if (error.code === '23505') throw badRequest('This pathway is already active for that visit.', 409);
    throw error;
  }
}

async function updatePathwayStage({ instanceId, instanceStageId, status, actorStaffId }) {
  const iid = integer(instanceId, 'instance_id', 1, 2147483647);
  const sid = integer(instanceStageId, 'instance_stage_id', 1, 2147483647);
  const target = String(status || '').toUpperCase();
  if (!['IN_PROGRESS', 'COMPLETED'].includes(target)) throw badRequest('Stage status must be IN_PROGRESS or COMPLETED.');
  return withTransaction(async client => {
    const result = await client.query(
      'SELECT x.instance_stage_id, x.instance_id, x.status, i.queue_id, i.status AS instance_status, s.stage_id, s.stage_order, s.stage_code, s.stage_name, s.required_resource_tags, s.is_required FROM care_pathway_instance_stages x JOIN care_pathway_instances i ON i.instance_id=x.instance_id JOIN care_pathway_stages s ON s.stage_id=x.stage_id WHERE x.instance_id=$1 AND x.instance_stage_id=$2 FOR UPDATE OF x',
      [iid, sid]
    );
    const current = result.rows[0];
    if (!current) throw badRequest('Pathway stage not found.', 404);
    if (current.instance_status !== 'IN_PROGRESS') throw badRequest('This pathway is not active.', 409);
    if (target === 'IN_PROGRESS' && !['PENDING', 'BLOCKED'].includes(current.status)) throw badRequest('Only a pending or blocked stage can be started.', 409);
    if (target === 'COMPLETED' && current.status !== 'IN_PROGRESS') throw badRequest('Start a stage before marking it complete.', 409);
    const pendingDependencies = await client.query(
      "SELECT COUNT(*)::int AS incomplete FROM care_pathway_stages dependency JOIN care_pathway_instance_stages dependency_state ON dependency_state.stage_id=dependency.stage_id AND dependency_state.instance_id=$1 WHERE dependency.template_id=(SELECT template_id FROM care_pathway_instances WHERE instance_id=$1) AND dependency.stage_code = ANY($2::TEXT[]) AND dependency_state.status <> 'COMPLETED'",
      [iid, current.depends_on_stage_codes || []]
    );
    if (Number(pendingDependencies.rows[0].incomplete) > 0) throw badRequest('Complete all declared dependency stages before progressing this stage.', 409);
    if (target === 'IN_PROGRESS' && current.required_resource_tags?.length) {
      const available = await client.query(
        "SELECT COALESCE(SUM(capacity), 0)::int AS capacity FROM clinic_resources WHERE status = 'AVAILABLE' AND service_tags && $1::TEXT[]",
        [current.required_resource_tags]
      );
      if (Number(available.rows[0].capacity) < 1) {
        const blocked = await client.query(
          "UPDATE care_pathway_instance_stages SET status='BLOCKED', started_at=NULL, completed_at=NULL, updated_by_staff_id=$1, updated_at=NOW() WHERE instance_stage_id=$2 RETURNING instance_stage_id, instance_id, status, started_at, completed_at, updated_at",
          [actorStaffId, sid]
        );
        await recordEvent(client, { eventType: 'pathway_stage_blocked', entityType: 'care_pathway_instance_stage', entityId: sid, queueId: current.queue_id, actorStaffId, details: { instance_id: iid, stage_code: current.stage_code, reason: 'required_resource_unavailable', required_resource_tags: current.required_resource_tags } });
        return { ...blocked.rows[0], blocked_reason: 'No available resource matches the required service tags.' };
      }
    }
    const updated = await client.query(
      "UPDATE care_pathway_instance_stages SET status=$1, started_at=CASE WHEN $1='IN_PROGRESS' THEN COALESCE(started_at,NOW()) ELSE started_at END, completed_at=CASE WHEN $1='COMPLETED' THEN NOW() ELSE NULL END, updated_by_staff_id=$2, updated_at=NOW() WHERE instance_stage_id=$3 RETURNING instance_stage_id, instance_id, status, started_at, completed_at, updated_at",
      [target, actorStaffId, sid]
    );
    if (target === 'COMPLETED') {
      const remaining = await client.query("SELECT COUNT(*)::int AS remaining FROM care_pathway_instance_stages x JOIN care_pathway_stages s ON s.stage_id=x.stage_id WHERE x.instance_id=$1 AND s.is_required=TRUE AND x.status <> 'COMPLETED'", [iid]);
      if (Number(remaining.rows[0].remaining) === 0) await client.query("UPDATE care_pathway_instances SET status='COMPLETED', completed_at=NOW() WHERE instance_id=$1", [iid]);
    }
    await recordEvent(client, { eventType: target === 'COMPLETED' ? 'pathway_stage_completed' : 'pathway_stage_started', entityType: 'care_pathway_instance_stage', entityId: sid, queueId: current.queue_id, actorStaffId, details: { instance_id: iid, stage_code: current.stage_code, status: target } });
    return updated.rows[0];
  });
}

async function createFlowSimulation(input, actorStaffId) {
  const context = await getOperationalContext();
  const arrivals = integer(input.additional_arrivals, 'additional_arrivals', 0, 500, 6);
  const horizon = integer(input.horizon_minutes, 'horizon_minutes', 15, 480, 60);
  const delta = integer(input.station_delta, 'station_delta', -20, 20, 0);
  const outage = integer(input.outage_minutes, 'outage_minutes', 0, 240, 0);
  const proposedStations = context.staffed_stations_modelled + delta;
  if (proposedStations < 1 || proposedStations > 50) throw badRequest('The proposed plan must retain between 1 and 50 modelled stations.');
  const baseInput = { initialQueue: context.waiting, arrivalCount: arrivals, horizonMinutes: horizon, serviceMinutes: context.service_minutes_modelled, staffedStations: context.staffed_stations_modelled, unavailableMinutes: 0, replications: 60, seed: stableSeed([context.waiting, arrivals, horizon, outage, context.service_minutes_modelled].join(':')) };
  const baseline = simulateQueue(baseInput);
  const proposed = simulateQueue({ ...baseInput, staffedStations: proposedStations, unavailableMinutes: outage, seed: baseInput.seed });
  const feasibilityWarnings = [];
  if (!context.staffing_schedule_found) feasibilityWarnings.push('No doctor shift is currently detected. Confirm actual clinical coverage before acting.');
  if (proposedStations > context.consultation_stations_inventory) feasibilityWarnings.push('Proposed stations exceed currently available consultation resources; additional physical resources would be required.');
  if (context.staffing_schedule_found && proposedStations > context.doctors_on_duty) feasibilityWarnings.push('Proposed stations exceed scheduled on-duty doctor count; additional staff coverage would be required.');
  const assumptions = {
    waiting_queue_size: context.waiting,
    service_duration_source: context.service_duration_source,
    observed_service_duration_sample_size: context.service_duration_sample_size,
    doctor_shift_found: context.staffing_schedule_found,
    consultation_stations_inventory: context.consultation_stations_inventory,
    doctors_on_duty: context.doctors_on_duty,
    resource_inventory_fallback_used: context.resource_inventory_fallback_used,
    feasibility_warnings: feasibilityWarnings,
    clinical_safety: 'This simulation does not assign or alter patient triage priorities and must not be used to make treatment decisions.'
  };
  const inserted = await query(
    'INSERT INTO flow_simulations(simulation_type, title, inputs, baseline_result, proposed_result, assumptions, created_by_staff_id) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7) RETURNING simulation_id, created_at',
    ['FLOW_TWIN', 'FlowTwin capacity scenario', JSON.stringify({ additional_arrivals: arrivals, horizon_minutes: horizon, station_delta: delta, outage_minutes: outage, modelled_service_minutes: context.service_minutes_modelled }), JSON.stringify(baseline), JSON.stringify(proposed), JSON.stringify(assumptions), actorStaffId]
  );
  await recordEvent(query, { eventType: 'flow_simulation_completed', entityType: 'flow_simulation', entityId: inserted.rows[0].simulation_id, actorStaffId, details: { horizon_minutes: horizon, station_delta: delta, additional_arrivals: arrivals } });
  return { simulation_id: inserted.rows[0].simulation_id, created_at: inserted.rows[0].created_at, inputs: { additional_arrivals: arrivals, horizon_minutes: horizon, station_delta: delta, outage_minutes: outage }, baseline, proposed, impact: { p50_wait_change_minutes: Number((proposed.predicted_wait_p50_minutes - baseline.predicted_wait_p50_minutes).toFixed(2)), p90_wait_change_minutes: Number((proposed.predicted_wait_p90_minutes - baseline.predicted_wait_p90_minutes).toFixed(2)), completion_change: Number((proposed.average_completed_by_horizon - baseline.average_completed_by_horizon).toFixed(2)) }, assumptions };
}

async function runLab(input, actorStaffId) {
  const context = await getOperationalContext();
  const cases = integer(input.cases, 'cases', 10, 500, 100);
  const seed = integer(input.seed, 'seed', 1, 2147483647, 20261015);
  const results = runSyntheticLab({ cases, seed, baseQueue: context.waiting, serviceMinutes: context.service_minutes_modelled, staffedStations: context.staffed_stations_modelled });
  const stored = await query(
    'INSERT INTO flow_simulations(simulation_type, title, inputs, baseline_result, proposed_result, assumptions, created_by_staff_id) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7) RETURNING simulation_id, created_at',
    ['SYNTHETIC_LAB', 'Synthetic clinic stress test', JSON.stringify({ cases, seed }), JSON.stringify({ baseline_case: 'Not applicable; generated cases are synthetic.' }), JSON.stringify(results), JSON.stringify({ base_queue: context.waiting, service_duration_source: context.service_duration_source, model_version: 'pqfms-synthetic-lab-v1' }), actorStaffId]
  );
  await recordEvent(query, { eventType: 'synthetic_lab_completed', entityType: 'flow_simulation', entityId: stored.rows[0].simulation_id, actorStaffId, details: { cases, seed } });
  return { simulation_id: stored.rows[0].simulation_id, created_at: stored.rows[0].created_at, ...results };
}

async function listSimulations({ limit = 20 } = {}) {
  const take = integer(limit, 'limit', 1, 100, 20);
  const result = await query('SELECT simulation_id, simulation_type, title, inputs, baseline_result, proposed_result, assumptions, created_at FROM flow_simulations ORDER BY created_at DESC LIMIT $1', [take]);
  return result.rows;
}

async function captureForecast(actorStaffId) {
  const context = await getOperationalContext();
  const forecast = simulateQueue({ initialQueue: context.waiting, arrivalCount: 0, horizonMinutes: 60, serviceMinutes: context.service_minutes_modelled, staffedStations: context.staffed_stations_modelled, unavailableMinutes: 0, replications: 60, seed: stableSeed([context.waiting, context.service_minutes_modelled, context.staffed_stations_modelled].join(':')) });
  const assumptions = { service_duration_source: context.service_duration_source, service_duration_sample_size: context.service_duration_sample_size, resource_inventory_fallback_used: context.resource_inventory_fallback_used, staffed_stations_modelled: context.staffed_stations_modelled, target_definition: 'Median waiting time for the queue cohort represented at capture time. Record a comparable observed cohort outcome before interpreting forecast error.' };
  const result = await query('INSERT INTO wait_forecast_ledger(forecast_scope, horizon_minutes, predicted_p50_minutes, predicted_p90_minutes, sample_size, model_version, assumptions, created_by_staff_id) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *', ['CURRENT_WAITING_COHORT', 60, forecast.predicted_wait_p50_minutes, Math.max(forecast.predicted_wait_p50_minutes, forecast.predicted_wait_p90_minutes), context.waiting, forecast.model_version, JSON.stringify(assumptions), actorStaffId]);
  await recordEvent(query, { eventType: 'wait_forecast_captured', entityType: 'wait_forecast', entityId: result.rows[0].forecast_id, actorStaffId, details: { horizon_minutes: 60, sample_size: context.waiting } });
  return result.rows[0];
}

async function listForecasts({ limit = 50 } = {}) {
  const take = integer(limit, 'limit', 1, 200, 50);
  const result = await query('SELECT forecast_id, forecast_scope, horizon_minutes, predicted_p50_minutes, predicted_p90_minutes, actual_wait_minutes, sample_size, model_version, assumptions, created_at, actual_recorded_at FROM wait_forecast_ledger ORDER BY created_at DESC LIMIT $1', [take]);
  return result.rows;
}

async function resolveForecast(forecastId, actualMinutes, actorStaffId) {
  const id = integer(forecastId, 'forecast_id', 1, 2147483647);
  const actual = Number(actualMinutes);
  if (!Number.isFinite(actual) || actual < 0 || actual > 1440) throw badRequest('actual_wait_minutes must be between 0 and 1440.');
  return withTransaction(async client => {
    const row = await client.query('UPDATE wait_forecast_ledger SET actual_wait_minutes=$1, actual_recorded_by_staff_id=$2, actual_recorded_at=NOW() WHERE forecast_id=$3 AND actual_wait_minutes IS NULL RETURNING *', [actual, actorStaffId, id]);
    if (!row.rows[0]) {
      const exists = await client.query('SELECT forecast_id, actual_wait_minutes FROM wait_forecast_ledger WHERE forecast_id=$1', [id]);
      if (!exists.rows[0]) throw badRequest('Forecast not found.', 404);
      throw badRequest('An actual outcome has already been recorded for this forecast.', 409);
    }
    await recordEvent(client, { eventType: 'forecast_outcome_recorded', entityType: 'wait_forecast', entityId: id, actorStaffId, details: { actual_wait_minutes: actual, absolute_error_minutes: Number(Math.abs(actual - Number(row.rows[0].predicted_p50_minutes)).toFixed(2)) } });
    return row.rows[0];
  });
}

async function createReferral(input, actorStaffId) {
  const queueId = integer(input.queue_id, 'queue_id', 1, 2147483647);
  const facility = text(input.target_facility, 'target_facility', 140);
  const service = text(input.target_service, 'target_service', 120);
  const reason = text(input.reason, 'reason', 500);
  const queue = await query('SELECT queue_id, patient_id FROM queue_entries WHERE queue_id=$1', [queueId]);
  if (!queue.rows[0]) throw badRequest('Queue entry not found.', 404);
  const reference = 'REF-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const created = await query('INSERT INTO operational_referrals(reference_code, patient_id, source_queue_id, target_facility, target_service, reason, created_by_staff_id, updated_by_staff_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING referral_id, reference_code, patient_id, source_queue_id, target_facility, target_service, reason, status, created_at', [reference, queue.rows[0].patient_id, queueId, facility, service, reason, actorStaffId]);
  await recordEvent(query, { eventType: 'referral_created', entityType: 'referral', entityId: created.rows[0].referral_id, queueId, actorStaffId, details: { reference_code: reference, target_service: service, status: 'OPEN' } });
  return created.rows[0];
}

async function listReferrals({ limit = 100 } = {}) {
  const take = integer(limit, 'limit', 1, 200, 100);
  const result = await query('SELECT r.referral_id, r.reference_code, r.source_queue_id, q.ticket_number, r.target_facility, r.target_service, r.reason, r.status, r.created_at, r.sent_at, r.acknowledged_at, r.completed_at FROM operational_referrals r LEFT JOIN queue_entries q ON q.queue_id=r.source_queue_id ORDER BY r.created_at DESC LIMIT $1', [take]);
  return result.rows;
}

async function updateReferralStatus(referralId, nextStatus, actorStaffId) {
  const id = integer(referralId, 'referral_id', 1, 2147483647);
  const target = String(nextStatus || '').toUpperCase();
  const valid = ['SENT', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED'];
  if (!valid.includes(target)) throw badRequest('Invalid referral status.');
  return withTransaction(async client => {
    const selected = await client.query('SELECT referral_id, status, reference_code, source_queue_id FROM operational_referrals WHERE referral_id=$1 FOR UPDATE', [id]);
    if (!selected.rows[0]) throw badRequest('Referral not found.', 404);
    const current = selected.rows[0].status;
    const allowed = { OPEN: ['SENT', 'CANCELLED'], SENT: ['ACKNOWLEDGED', 'CANCELLED'], ACKNOWLEDGED: ['COMPLETED', 'CANCELLED'] };
    if (!(allowed[current] || []).includes(target)) throw badRequest('Referral cannot transition from ' + current + ' to ' + target + '.', 409);
    const updated = await client.query("UPDATE operational_referrals SET status=$1, updated_by_staff_id=$2, sent_at=CASE WHEN $1='SENT' THEN NOW() ELSE sent_at END, acknowledged_at=CASE WHEN $1='ACKNOWLEDGED' THEN NOW() ELSE acknowledged_at END, completed_at=CASE WHEN $1='COMPLETED' THEN NOW() ELSE completed_at END WHERE referral_id=$3 RETURNING referral_id, reference_code, source_queue_id, target_facility, target_service, reason, status, created_at, sent_at, acknowledged_at, completed_at", [target, actorStaffId, id]);
    await recordEvent(client, { eventType: 'referral_status_changed', entityType: 'referral', entityId: id, queueId: selected.rows[0].source_queue_id, actorStaffId, details: { reference_code: selected.rows[0].reference_code, previous_status: current, status: target } });
    return updated.rows[0];
  });
}

async function getContactPreference(patientId) {
  const id = integer(patientId, 'patient_id', 1, 2147483647);
  const result = await query("SELECT p.patient_id, split_part(p.full_name, ' ', 1) AS first_name, CASE WHEN p.contact_no IS NULL THEN NULL ELSE '••••' || RIGHT(regexp_replace(p.contact_no, '[^0-9]', '', 'g'), 4) END AS masked_contact, pref.channel, pref.opted_in, pref.consent_source, pref.consented_at, pref.updated_at FROM patients p LEFT JOIN patient_contact_preferences pref ON pref.patient_id=p.patient_id AND pref.channel='SMS' WHERE p.patient_id=$1", [id]);
  if (!result.rows[0]) throw badRequest('Patient not found.', 404);
  return result.rows[0];
}

async function setContactPreference(patientId, input, actorStaffId) {
  const id = integer(patientId, 'patient_id', 1, 2147483647);
  if (typeof input.opted_in !== 'boolean') throw badRequest('opted_in must be true or false.');
  const source = String(input.consent_source || '').toUpperCase();
  if (!['RECEPTION', 'KIOSK', 'PAPER_FORM', 'PATIENT_REQUEST'].includes(source)) throw badRequest('Invalid consent source.');
  const patient = await query('SELECT patient_id FROM patients WHERE patient_id=$1', [id]);
  if (!patient.rows[0]) throw badRequest('Patient not found.', 404);
  const saved = await query("INSERT INTO patient_contact_preferences(patient_id, channel, opted_in, consent_source, updated_by_staff_id, consented_at, updated_at) VALUES ($1,'SMS',$2,$3,$4,CASE WHEN $2 THEN NOW() ELSE NULL END,NOW()) ON CONFLICT (patient_id, channel) DO UPDATE SET opted_in=EXCLUDED.opted_in, consent_source=EXCLUDED.consent_source, updated_by_staff_id=EXCLUDED.updated_by_staff_id, consented_at=EXCLUDED.consented_at, updated_at=NOW() RETURNING patient_id, channel, opted_in, consent_source, consented_at, updated_at", [id, input.opted_in, source, actorStaffId]);
  await recordEvent(query, { eventType: input.opted_in ? 'sms_consent_granted' : 'sms_consent_withdrawn', entityType: 'patient_contact_preference', entityId: id, actorStaffId, details: { channel: 'SMS', consent_source: source } });
  return saved.rows[0];
}

async function sendWaitEstimate(patientId, input, actorStaffId) {
  const id = integer(patientId, 'patient_id', 1, 2147483647);
  const wait = integer(input.estimated_wait_minutes, 'estimated_wait_minutes', 0, 1440);
  const result = await query("SELECT p.contact_no, pref.opted_in FROM patients p LEFT JOIN patient_contact_preferences pref ON pref.patient_id=p.patient_id AND pref.channel='SMS' WHERE p.patient_id=$1", [id]);
  if (!result.rows[0]) throw badRequest('Patient not found.', 404);
  if (result.rows[0].opted_in !== true) throw badRequest('SMS updates require recorded patient consent.', 409);
  if (!result.rows[0].contact_no) throw badRequest('No contact number is recorded for this patient.', 409);
  let delivery;
  try { delivery = await smsService.sendWaitEstimate({ to: result.rows[0].contact_no, estimatedWaitMinutes: wait }); }
  catch (_error) { delivery = { sent: false, skipped: false, reason: 'provider-error' }; }
  const status = delivery.sent ? 'SENT' : delivery.skipped ? 'SKIPPED' : 'FAILED';
  const saved = await query('INSERT INTO patient_notifications(patient_id, channel, notification_type, status, provider_reference, safe_result, created_by_staff_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING notification_id, status, safe_result, created_at', [id, 'SMS', 'WAIT_ESTIMATE', status, delivery.provider_reference || null, String(delivery.reason || (delivery.sent ? 'sent' : status.toLowerCase())).slice(0, 80), actorStaffId]);
  await recordEvent(query, { eventType: 'patient_wait_estimate_notification', entityType: 'patient_notification', entityId: saved.rows[0].notification_id, actorStaffId, details: { channel: 'SMS', status, template: 'WAIT_ESTIMATE' } });
  return saved.rows[0];
}

async function submitContinuityObservation(input, actorStaffId) {
  const eventId = String(input.client_event_id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) throw badRequest('client_event_id must be a valid UUID.');
  const type = String(input.event_type || '').toUpperCase();
  let payload;
  if (type === 'OPERATIONAL_INCIDENT_RECORDED') {
    const code = String(input.payload?.incident_code || '').toUpperCase();
    if (!['NETWORK_UNAVAILABLE', 'POWER_DISRUPTION', 'MANUAL_WORKFLOW_STARTED', 'RESOURCE_UNAVAILABLE', 'SERVICE_UNAVAILABLE'].includes(code)) throw badRequest('Unsupported operational incident code.');
    payload = { incident_code: code };
  } else if (type === 'RESOURCE_STATUS_OBSERVED') {
    const resourceId = integer(input.payload?.resource_id, 'resource_id', 1, 2147483647);
    const observedStatus = String(input.payload?.observed_status || '').toUpperCase();
    if (!['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'MAINTENANCE'].includes(observedStatus)) throw badRequest('Invalid observed resource status.');
    payload = { resource_id: resourceId, observed_status: observedStatus };
  } else {
    throw badRequest('Unsupported offline event type.');
  }
  if (type === 'RESOURCE_STATUS_OBSERVED') {
    const resource = await query('SELECT resource_id FROM clinic_resources WHERE resource_id=$1', [payload.resource_id]);
    if (!resource.rows[0]) throw badRequest('Resource for this observation does not exist.', 404);
  }
  return withTransaction(async client => {
    const inserted = await client.query('INSERT INTO continuity_sync_receipts(client_event_id, event_type, payload, received_by_staff_id) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (client_event_id) DO NOTHING RETURNING client_event_id, event_type, payload, received_at', [eventId, type, JSON.stringify(payload), actorStaffId]);
    if (!inserted.rows[0]) {
      const existing = await client.query('SELECT event_type, payload FROM continuity_sync_receipts WHERE client_event_id=$1', [eventId]);
      if (!existing.rows[0] || existing.rows[0].event_type !== type || canonicalJson(existing.rows[0].payload) !== canonicalJson(payload)) {
        throw badRequest('This client_event_id has already been used for a different observation.', 409);
      }
      return { accepted: true, duplicate: true, client_event_id: eventId };
    }
    await recordEvent(client, { eventType: 'offline_observation_received', entityType: 'offline_event', entityId: eventId, actorStaffId, source: 'OFFLINE_SYNC', details: { event_type: type, payload } });
    return { accepted: true, duplicate: false, ...inserted.rows[0] };
  });
}

async function listContinuityReceipts({ limit = 50 } = {}) {
  const take = integer(limit, 'limit', 1, 100, 50);
  const result = await query('SELECT client_event_id, event_type, payload, received_at FROM continuity_sync_receipts ORDER BY received_at DESC LIMIT $1', [take]);
  return result.rows;
}

module.exports = {
  listEvents, listResources, createResource, updateResource, getOperationalContext,
  getFairnessSnapshot, getSummary, listActiveQueue, listPathways, createPathwayTemplate, listPathwayInstances,
  openPathway, updatePathwayStage, createFlowSimulation, runLab, listSimulations,
  captureForecast, listForecasts, resolveForecast, createReferral, listReferrals,
  updateReferralStatus, getContactPreference, setContactPreference, sendWaitEstimate,
  submitContinuityObservation, listContinuityReceipts
};