const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');
const STATUSES = ['REQUESTED','ACKNOWLEDGED','IN_PROGRESS','COMPLETED','CANCELLED'];
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const id = (v, label) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw err(label + ' must be a positive integer.'); return n; };
const text = (v, label, min, max) => { const s = String(v || '').trim(); if (s.length < min || s.length > max) throw err(label + ' length is invalid.'); return s; };

async function listReferrals({ status = null, limit = 100 } = {}) {
  const n = Math.max(1, Math.min(200, Number(limit) || 100));
  const params = [];
  let where = '';
  if (status) { const s = String(status).toUpperCase(); if (!STATUSES.includes(s)) throw err('Referral status is invalid.'); params.push(s); where = 'WHERE r.status = $1'; }
  params.push(n);
  const result = await query(
    'SELECT r.referral_id,r.patient_id,p.full_name AS patient_name,r.queue_id,r.referred_to,r.reason,r.status,r.due_at,r.acknowledgement_note,r.created_by_staff_id,r.updated_by_staff_id,r.created_at,r.updated_at,r.completed_at ' +
    'FROM care_referrals r JOIN patients p ON p.patient_id=r.patient_id ' + where +
    " ORDER BY CASE WHEN r.status IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END,r.due_at NULLS LAST,r.created_at DESC LIMIT $" + params.length, params);
  return result.rows;
}

async function createReferral(input, actorStaffId) {
  const patientId = id(input.patient_id, 'patient_id');
  const queueId = input.queue_id == null || input.queue_id === '' ? null : id(input.queue_id, 'queue_id');
  const referredTo = text(input.referred_to, 'referred_to', 2, 160);
  const reason = text(input.reason, 'reason', 3, 1000);
  let dueAt = null;
  if (input.due_at) { const date = new Date(input.due_at); if (!Number.isFinite(date.getTime())) throw err('due_at must be a valid date/time.'); dueAt = date.toISOString(); }
  return withTransaction(async client => {
    const p = await client.query('SELECT patient_id FROM patients WHERE patient_id=$1', [patientId]);
    if (!p.rows[0]) throw err('Patient not found.', 404);
    if (queueId) { const q = await client.query('SELECT queue_id FROM queue_entries WHERE queue_id=$1 AND patient_id=$2', [queueId, patientId]); if (!q.rows[0]) throw err('The selected queue visit does not belong to this patient.'); }
    const result = await client.query(
      'INSERT INTO care_referrals (patient_id,queue_id,referred_to,reason,due_at,created_by_staff_id,updated_by_staff_id) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING referral_id,patient_id,queue_id,referred_to,reason,status,due_at,created_at,updated_at',
      [patientId, queueId, referredTo, reason, dueAt, actorStaffId]);
    await appendOperationalEvent(client, { eventType:'REFERRAL_CREATED', entityType:'CARE_REFERRAL', entityId:result.rows[0].referral_id, actorStaffId, toState:'REQUESTED', metadata:{ referred_to:referredTo, has_due_date:Boolean(dueAt) } });
    return result.rows[0];
  });
}

async function updateReferral(referralId, input, actorStaffId) {
  const referralIdNum = id(referralId, 'referral_id');
  const status = String(input.status || '').toUpperCase();
  if (!STATUSES.includes(status)) throw err('Referral status is invalid.');
  const note = String(input.acknowledgement_note || '').trim();
  if (note.length > 500) throw err('acknowledgement_note may not exceed 500 characters.');
  return withTransaction(async client => {
    const result = await client.query('SELECT referral_id,status FROM care_referrals WHERE referral_id=$1 FOR UPDATE', [referralIdNum]);
    const current = result.rows[0];
    if (!current) throw err('Referral not found.', 404);
    const transitions = { REQUESTED:['REQUESTED','ACKNOWLEDGED','CANCELLED'], ACKNOWLEDGED:['ACKNOWLEDGED','IN_PROGRESS','CANCELLED'], IN_PROGRESS:['IN_PROGRESS','COMPLETED','CANCELLED'], COMPLETED:['COMPLETED'], CANCELLED:['CANCELLED'] };
    if (!transitions[current.status].includes(status)) throw err('The requested referral status transition is not permitted.', 409);
    const updated = await client.query(
      "UPDATE care_referrals SET status=$1,acknowledgement_note=$2,updated_by_staff_id=$3,updated_at=NOW(),completed_at=CASE WHEN $1='COMPLETED' THEN NOW() ELSE completed_at END WHERE referral_id=$4 RETURNING referral_id,patient_id,queue_id,referred_to,reason,status,due_at,acknowledgement_note,updated_at,completed_at",
      [status, note, actorStaffId, referralIdNum]);
    await appendOperationalEvent(client, { eventType:'REFERRAL_STATUS_CHANGED', entityType:'CARE_REFERRAL', entityId:referralIdNum, actorStaffId, fromState:current.status, toState:status, metadata:{ acknowledgement_note_present:Boolean(note) } });
    return updated.rows[0];
  });
}
module.exports = { listReferrals, createReferral, updateReferral };
