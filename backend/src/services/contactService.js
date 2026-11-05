const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');
const smsService = require('./smsService');
const env = require('../config/env');
const { getWaitPredictions } = require('./analyticsProxyService');

const LANGUAGES = ['en','af','zu','xh','st','tn','nso','ts','ss','ve','nr'];
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const id = (v, label) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw err(label + ' must be a positive integer.'); return n; };

async function getContactPreferences(patientId) {
  const patient = id(patientId, 'patient_id');
  const result = await query(
    'SELECT patient_id,preferred_language_code,preferred_channel,contact_consent,consent_method,consent_version,consent_recorded_at,updated_at FROM patient_contact_preferences WHERE patient_id=$1',
    [patient]);
  if (result.rows[0]) return result.rows[0];
  const exists = await query('SELECT patient_id FROM patients WHERE patient_id=$1', [patient]);
  if (!exists.rows[0]) throw err('Patient not found.', 404);
  return { patient_id: patient, preferred_language_code: 'en', preferred_channel: 'NONE', contact_consent: false, consent_method: 'STAFF_RECORDED', consent_version: 'v1', consent_recorded_at: null, not_configured: true };
}

async function updateContactPreferences(patientId, input, actorStaffId) {
  const patient = id(patientId, 'patient_id');
  const language = String(input.preferred_language_code || 'en').toLowerCase();
  const channel = String(input.preferred_channel || 'NONE').toUpperCase();
  const consent = input.contact_consent === true;
  const method = String(input.consent_method || 'STAFF_RECORDED').toUpperCase();
  const version = String(input.consent_version || 'v1').trim();
  if (!LANGUAGES.includes(language)) throw err('preferred_language_code is not supported.');
  if (!['NONE','SMS','VOICE'].includes(channel)) throw err('preferred_channel must be NONE, SMS or VOICE.');
  if (!['STAFF_RECORDED','KIOSK','SMS','VOICE','REVOKED'].includes(method)) throw err('consent_method is invalid.');
  if (consent && (input.consent_confirmed !== true || channel === 'NONE')) throw err('Explicit consent confirmation and a contact channel are required before opting in.');
  if (!version || version.length > 30) throw err('consent_version must contain 1 to 30 characters.');
  return withTransaction(async client => {
    const exists = await client.query('SELECT patient_id FROM patients WHERE patient_id=$1', [patient]);
    if (!exists.rows[0]) throw err('Patient not found.', 404);
    const saved = await client.query(
      'INSERT INTO patient_contact_preferences (patient_id,preferred_language_code,preferred_channel,contact_consent,consent_method,consent_version,updated_by_staff_id,consent_recorded_at) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $4 THEN NOW() ELSE NULL END) ' +
      'ON CONFLICT (patient_id) DO UPDATE SET preferred_language_code=EXCLUDED.preferred_language_code,preferred_channel=EXCLUDED.preferred_channel,' +
      'contact_consent=EXCLUDED.contact_consent,consent_method=CASE WHEN EXCLUDED.contact_consent THEN EXCLUDED.consent_method ELSE \'REVOKED\' END,' +
      'consent_version=EXCLUDED.consent_version,updated_by_staff_id=EXCLUDED.updated_by_staff_id,' +
      'consent_recorded_at=CASE WHEN EXCLUDED.contact_consent THEN NOW() ELSE NULL END,updated_at=NOW() ' +
      'RETURNING patient_id,preferred_language_code,preferred_channel,contact_consent,consent_method,consent_version,consent_recorded_at,updated_at',
      [patient, language, channel, consent, method, version, actorStaffId]);
    await appendOperationalEvent(client, {
      eventType:'PATIENT_CONTACT_PREFERENCE_UPDATED', entityType:'PATIENT_CONTACT_PREFERENCE', entityId:patient, actorStaffId,
      toState:consent ? 'CONSENTED' : 'NOT_CONSENTED',
      metadata:{ preferred_language_code:language, preferred_channel:channel, contact_consent:consent, consent_version:version }
    });
    return saved.rows[0];
  });
}

async function getCurrentWaitEstimate(patientId) {
  const active = await query(
    "SELECT queue_id, COALESCE(priority_level,4)::int AS tier FROM queue_entries WHERE patient_id=$1 AND status='Waiting' ORDER BY queued_at DESC LIMIT 1",
    [patientId]
  );
  if (!active.rows[0]) throw err('A current waiting visit is required for a wait estimate.', 409);
  const prediction = await getWaitPredictions({ timeoutMs: 2000 });
  const visitEstimate = Array.isArray(prediction.visit_estimates)
    ? prediction.visit_estimates.find(item => Number(item.queue_id) === Number(active.rows[0].queue_id))
    : null;
  const rawWait = visitEstimate?.estimated_wait_minutes;
  const wait = rawWait === null || rawWait === undefined ? Number.NaN : Number(rawWait);
  if (prediction.degraded || !Number.isFinite(wait) || wait < 0) {
    throw err('The current wait estimate for this visit is unavailable. No estimate message was sent.', 503);
  }
  return wait;
}

async function sendAccessUpdate(patientId, input, actorStaffId) {
  const patientIdNum = id(patientId, 'patient_id');
  const template = String(input.template_code || '').toUpperCase();
  if (!['WAIT_ESTIMATE','SERVICE_DELAY'].includes(template)) throw err('template_code must be WAIT_ESTIMATE or SERVICE_DELAY.');
  const eligible = await query(
    'SELECT p.patient_id,p.contact_no,pref.preferred_channel,pref.contact_consent,pref.preferred_language_code ' +
    'FROM patients p JOIN patient_contact_preferences pref ON pref.patient_id=p.patient_id WHERE p.patient_id=$1',
    [patientIdNum]);
  const patient = eligible.rows[0];
  if (!patient) throw err('Patient communication preferences are not configured.', 409);
  if (!patient.contact_consent || patient.preferred_channel !== 'SMS') throw err('Recorded SMS consent is required before sending an access update.', 403);
  const providerReady = env.SMS_ENABLED && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER;
  if (providerReady) {
    const recent = await query(
      "SELECT communication_id FROM patient_communications WHERE patient_id=$1 AND delivery_status='SENT' " +
      "AND created_at >= NOW() - INTERVAL '2 minutes' ORDER BY created_at DESC LIMIT 1",
      [patientIdNum]
    );
    if (recent.rows[0]) throw err('An operational SMS was sent to this patient recently. Wait two minutes before sending another update.', 429);
  }
  const wait = template === 'WAIT_ESTIMATE' && providerReady ? await getCurrentWaitEstimate(patientIdNum) : null;
  let result;
  try {
    result = await smsService.sendAccessUpdate({ to:patient.contact_no, templateCode:template, waitMinutes:wait, language:patient.preferred_language_code });
  } catch (_error) {
    result = { status:'FAILED', reason:'provider-error' };
  }
  const status = ['SENT','SKIPPED','FAILED'].includes(result.status) ? result.status : 'FAILED';
  return withTransaction(async client => {
    const saved = await client.query(
      'INSERT INTO patient_communications (patient_id,channel,template_code,delivery_status,provider_message_id,status_message,created_by_staff_id) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING communication_id,channel,template_code,delivery_status,status_message,created_at',
      [patientIdNum,'SMS',template,status,result.providerMessageId || null,String(result.reason || '').slice(0,160),actorStaffId]);
    await appendOperationalEvent(client, {
      eventType:'ACCESS_BRIDGE_MESSAGE_ATTEMPTED', entityType:'PATIENT_COMMUNICATION', entityId:saved.rows[0].communication_id,
      actorStaffId,toState:status,metadata:{ template_code:template, channel:'SMS' }
    });
    return { ...saved.rows[0], estimated_wait_minutes: template === 'WAIT_ESTIMATE' && status === 'SENT' ? wait : null, language_used: patient.preferred_language_code === 'en' ? 'en' : 'en-fallback', translation_review_required: patient.preferred_language_code !== 'en' };
  });
}
module.exports = { getContactPreferences, updateContactPreferences, sendAccessUpdate };
