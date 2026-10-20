const { query, withTransaction } = require('../db/pool');
const { allocateDailyTicket } = require('./ticketService');
const { validateSymptoms, validateTier } = require('../utils/validation');
const { sendCallNotification } = require('./smsService');
const { appendOperationalEvent } = require('./operationalEventService');

const PUBLIC_QUEUE_SELECT = `
  SELECT q.queue_id, q.ticket_number, q.status, q.priority_level, q.queued_at
  FROM queue_entries q
  WHERE q.status IN ('Waiting', 'In-Consultation')
    AND q.data_provenance NOT IN ('SYNTHETIC_TEST','DEMO')
`;

async function getActiveTicket(client, patientId) {
  const result = await client.query(`SELECT ticket_number FROM queue_entries WHERE patient_id = $1 AND status <> 'Discharged' LIMIT 1`, [patientId]);
  return result.rows[0]?.ticket_number || null;
}

async function checkIn({ patientId, identificationNumber, symptoms, requestedTicketDate = null }) {
  const cleanSymptoms = validateSymptoms(symptoms);
  if (!cleanSymptoms || (!patientId && !identificationNumber)) throw Object.assign(new Error('A patient and a reason for visit between 1 and 500 characters are required.'), { status: 400 });
  return withTransaction(async client => {
    const patientResult = patientId
      ? await client.query('SELECT patient_id FROM patients WHERE patient_id = $1', [patientId])
      : await client.query('SELECT patient_id FROM patients WHERE identification_number = $1', [String(identificationNumber).trim().toUpperCase()]);
    if (!patientResult.rows[0]) throw Object.assign(new Error('Patient record not found.'), { status: 404 });
    const resolvedPatientId = patientResult.rows[0].patient_id;
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [Number(resolvedPatientId)]);
    const dateResult = await client.query(`SELECT (NOW() AT TIME ZONE 'Africa/Johannesburg')::date AS ticket_date`);
    const ticketDate = requestedTicketDate || dateResult.rows[0].ticket_date;
    const existingTicket = await getActiveTicket(client, resolvedPatientId);
    if (existingTicket) return { duplicate: true, ticket_number: existingTicket };
    const ticketNumber = await allocateDailyTicket(client, ticketDate);
    try {
      const result = await client.query(
        `INSERT INTO queue_entries (patient_id, ticket_date, ticket_number, status, priority_level, symptoms)
         VALUES ($1, $2, $3, 'Waiting', NULL, $4)
         RETURNING queue_id, patient_id, ticket_date, ticket_number, status, priority_level, symptoms, queued_at`,
        [resolvedPatientId, ticketDate, ticketNumber, cleanSymptoms]
      );
      const visit = result.rows[0];
      const pathway = await client.query("SELECT pathway_id FROM care_pathways WHERE pathway_code = $1 AND is_active = TRUE LIMIT 1", ['OPD_STANDARD']);
      if (pathway.rows[0]) {
        const pathwayId = pathway.rows[0].pathway_id;
        await client.query('UPDATE queue_entries SET care_pathway_id = $1 WHERE queue_id = $2', [pathwayId, visit.queue_id]);
        await client.query(
          "INSERT INTO queue_pathway_progress (queue_id, stage_id, status, started_at, completed_at) " +
          "SELECT $1, stage_id, CASE WHEN sequence_no = 1 THEN 'COMPLETED' WHEN sequence_no = 2 THEN 'READY' ELSE 'PENDING' END, " +
          "CASE WHEN sequence_no = 1 THEN NOW() ELSE NULL END, CASE WHEN sequence_no = 1 THEN NOW() ELSE NULL END " +
          "FROM care_pathway_stages WHERE pathway_id = $2 ON CONFLICT (queue_id, stage_id) DO NOTHING",
          [visit.queue_id, pathwayId]
        );
        await appendOperationalEvent(client, { eventType: 'CARE_PATHWAY_ASSIGNED', entityType: 'QUEUE_VISIT', entityId: visit.queue_id, toState: 'OPD_STANDARD', metadata: { pathway_id: pathwayId, registration_stage_precompleted: true } });
        visit.care_pathway_id = pathwayId;
      }
      await appendOperationalEvent(client, {
        eventType: 'VISIT_CHECKED_IN',
        entityType: 'QUEUE_VISIT',
        entityId: visit.queue_id,
        toState: 'Waiting',
        metadata: { ticket_number: ticketNumber }
      });
      return { duplicate: false, visit };
    } catch (error) {
      if (error.code === '23505') {
        const raceTicket = await getActiveTicket(client, resolvedPatientId);
        if (raceTicket) return { duplicate: true, ticket_number: raceTicket };
      }
      throw error;
    }
  });
}

function queueOrderSql(alias = 'q') {
  return `CASE WHEN ${alias}.status = 'In-Consultation' THEN 0 ELSE 1 END,
          COALESCE(${alias}.priority_level, 4), ${alias}.queued_at ASC`;
}

async function listStaffQueue() {
  const result = await query(`
    SELECT q.queue_id, q.ticket_number, q.status, q.priority_level, q.symptoms, q.doctor_notes,
           q.queued_at, q.triaged_by_staff_id, q.triaged_at, q.called_by_staff_id, q.called_at,
           q.discharged_by_staff_id, q.discharged_at,
           p.patient_id, p.full_name, p.identification_number,
           t.username AS triaged_by_username,
           c.username AS called_by_username,
           d.username AS discharged_by_username
    FROM queue_entries q
    JOIN patients p ON p.patient_id = q.patient_id
    LEFT JOIN clinic_staff t ON t.staff_id = q.triaged_by_staff_id
    LEFT JOIN clinic_staff c ON c.staff_id = q.called_by_staff_id
    LEFT JOIN clinic_staff d ON d.staff_id = q.discharged_by_staff_id
    WHERE q.status IN ('Waiting', 'In-Consultation')
      AND q.data_provenance NOT IN ('SYNTHETIC_TEST','DEMO')
    ORDER BY ${queueOrderSql('q')}`);
  return result.rows;
}

async function listPublicQueue() {
  const result = await query(`${PUBLIC_QUEUE_SELECT} ORDER BY ${queueOrderSql('q')}`);
  const nowServing = result.rows.find(r => r.status === 'In-Consultation')?.ticket_number || null;
  const waiting = result.rows.filter(r => r.status === 'Waiting');
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  waiting.forEach(row => { counts[row.priority_level || 4] += 1; });
  return { now_serving: nowServing, waiting_counts: counts, updated_at: new Date().toISOString() };
}

async function findActiveForHistory() {
  const result = await query(`SELECT q.queue_id, q.ticket_number, q.status, q.priority_level, q.symptoms, q.queued_at FROM queue_entries q WHERE q.status IN ('Waiting','In-Consultation') AND q.data_provenance NOT IN ('SYNTHETIC_TEST','DEMO') ORDER BY ${queueOrderSql('q')}`);
  return result.rows;
}

async function setPriority(queueId, tier, staffId) {
  const priority = validateTier(tier);
  if (!priority) throw Object.assign(new Error('Priority tier must be an integer from 1 to 4.'), { status: 400 });
  return withTransaction(async client => {
    const result = await client.query(
      `UPDATE queue_entries SET priority_level = $1, triaged_by_staff_id = $2, triaged_at = NOW()
       WHERE queue_id = $3 AND status = 'Waiting'
       RETURNING queue_id, ticket_number, status, priority_level, symptoms, queued_at, triaged_by_staff_id, triaged_at`,
      [priority, staffId, queueId]
    );
    if (!result.rows[0]) {
      const check = await client.query('SELECT status FROM queue_entries WHERE queue_id = $1', [queueId]);
      if (!check.rows[0]) throw Object.assign(new Error('Queue entry not found.'), { status: 404 });
      throw Object.assign(new Error('Priority can only be changed while the visit is Waiting.'), { status: 409 });
    }
    await appendOperationalEvent(client, {
      eventType: 'VISIT_TRIAGED',
      entityType: 'QUEUE_VISIT',
      entityId: result.rows[0].queue_id,
      actorStaffId: staffId,
      toState: 'Waiting',
      metadata: { priority_level: priority }
    });
    return result.rows[0];
  });
}

async function callToRoom(queueId, staffId) {
  const visit = await withTransaction(async client => {
    const result = await client.query(
      `UPDATE queue_entries
       SET status = 'In-Consultation', called_by_staff_id = $1, called_at = NOW()
       WHERE queue_id = $2 AND status = 'Waiting'
       RETURNING queue_id, patient_id, ticket_number, status, priority_level, symptoms, queued_at, called_by_staff_id, called_at`,
      [staffId, queueId]
    );
    if (!result.rows[0]) {
      const check = await client.query('SELECT status FROM queue_entries WHERE queue_id = $1', [queueId]);
      if (!check.rows[0]) throw Object.assign(new Error('Queue entry not found.'), { status: 404 });
      throw Object.assign(new Error('Only a Waiting patient can be called to a room.'), { status: 409 });
    }
    await appendOperationalEvent(client, {
      eventType: 'CONSULTATION_STARTED',
      entityType: 'QUEUE_VISIT',
      entityId: result.rows[0].queue_id,
      actorStaffId: staffId,
      fromState: 'Waiting',
      toState: 'In-Consultation',
      metadata: { priority_level: result.rows[0].priority_level }
    });
    return result.rows[0];
  });
  const patient = await query('SELECT contact_no FROM patients WHERE patient_id = $1', [visit.patient_id]);
  let sms = { sent: false, skipped: true };
  try {
    sms = await sendCallNotification({ to: patient.rows[0]?.contact_no, ticketNumber: visit.ticket_number });
  } catch (error) {
    console.error('[SMS] Notification failed:', error.message);
    sms = { sent: false, skipped: false, error: error.message };
  }
  return { ...visit, sms_sent: sms.sent, sms_skipped: sms.skipped, sms_error: sms.error || null };
}

async function saveNotes(queueId, notes, staffId) {
  const doctorNotes = String(notes ?? '').trim();
  if (doctorNotes.length > 5000) throw Object.assign(new Error('Consultation notes may not exceed 5000 characters.'), { status: 400 });
  return withTransaction(async client => {
    const result = await client.query(
      `UPDATE queue_entries SET doctor_notes = $1 WHERE queue_id = $2 AND status = 'In-Consultation'
       RETURNING queue_id, doctor_notes`,
      [doctorNotes, queueId]
    );
    if (!result.rows[0]) {
      const check = await client.query('SELECT status FROM queue_entries WHERE queue_id = $1', [queueId]);
      if (!check.rows[0]) throw Object.assign(new Error('Queue entry not found.'), { status: 404 });
      throw Object.assign(new Error('Consultation notes can only be edited while the visit is In-Consultation.'), { status: 409 });
    }
    await appendOperationalEvent(client, {
      eventType: 'CONSULTATION_NOTE_SAVED',
      entityType: 'QUEUE_VISIT',
      entityId: result.rows[0].queue_id,
      actorStaffId: staffId,
      toState: 'In-Consultation',
      metadata: { note_length: doctorNotes.length }
    });
    return result.rows[0];
  });
}

async function discharge(queueId, staffId) {
  return withTransaction(async client => {
    const result = await client.query(
      `UPDATE queue_entries
       SET status = 'Discharged', discharged_by_staff_id = $1, discharged_at = NOW()
       WHERE queue_id = $2 AND status = 'In-Consultation'
       RETURNING queue_id, ticket_number, status, priority_level, queued_at, called_at, discharged_by_staff_id, discharged_at`,
      [staffId, queueId]
    );
    if (!result.rows[0]) {
      const check = await client.query('SELECT status FROM queue_entries WHERE queue_id = $1', [queueId]);
      if (!check.rows[0]) throw Object.assign(new Error('Queue entry not found.'), { status: 404 });
      throw Object.assign(new Error('Only an In-Consultation patient can be discharged.'), { status: 409 });
    }
    await appendOperationalEvent(client, {
      eventType: 'VISIT_DISCHARGED',
      entityType: 'QUEUE_VISIT',
      entityId: result.rows[0].queue_id,
      actorStaffId: staffId,
      fromState: 'In-Consultation',
      toState: 'Discharged',
      metadata: { priority_level: result.rows[0].priority_level }
    });
    return result.rows[0];
  });
}

async function history({ identificationNumber, role, limit = 50, offset = 0 }) {
  const params = [String(identificationNumber || '').trim().toUpperCase(), Math.min(Number(limit) || 50, 100), Math.max(Number(offset) || 0, 0)];
  const notesColumn = role === 'DOCTOR' ? ', q.doctor_notes' : '';
  const result = await query(
    `SELECT q.queue_id, q.ticket_number, q.status, q.priority_level, q.symptoms, q.queued_at,
            q.called_at, q.discharged_at ${notesColumn}
     FROM queue_entries q JOIN patients p ON p.patient_id = q.patient_id
     WHERE p.identification_number = $1 AND q.status = 'Discharged'
     ORDER BY q.discharged_at DESC LIMIT $2 OFFSET $3`, params
  );
  return result.rows;
}

async function overview() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'Waiting')::int AS waiting,
      COUNT(*) FILTER (WHERE status = 'In-Consultation')::int AS in_consultation,
      COUNT(*) FILTER (WHERE status = 'Discharged' AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_today,
      COUNT(*) FILTER (WHERE status = 'Discharged' AND priority_level = 1 AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_tier_1,
      COUNT(*) FILTER (WHERE status = 'Discharged' AND priority_level = 2 AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_tier_2,
      COUNT(*) FILTER (WHERE status = 'Discharged' AND priority_level = 3 AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_tier_3,
      COUNT(*) FILTER (WHERE status = 'Discharged' AND priority_level = 4 AND discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date)::int AS discharged_tier_4
    FROM queue_entries`);
  return result.rows[0];
}

async function dischargeLog({ limit = 100, offset = 0 }) {
  const result = await query(`
    SELECT q.queue_id, q.ticket_number, q.priority_level, q.symptoms, q.discharged_at,
           p.full_name, p.identification_number, d.username AS discharged_by_username
    FROM queue_entries q
    JOIN patients p ON p.patient_id = q.patient_id
    LEFT JOIN clinic_staff d ON d.staff_id = q.discharged_by_staff_id
    WHERE q.status = 'Discharged'
    ORDER BY q.discharged_at DESC LIMIT $1 OFFSET $2`, [Math.min(Number(limit) || 100, 200), Math.max(Number(offset) || 0, 0)]);
  return result.rows;
}

async function staffPerformance() {
  const result = await query(`
    SELECT cs.staff_id, cs.username, cs.role, COUNT(q.queue_id)::int AS discharged_today
    FROM clinic_staff cs
    JOIN queue_entries q ON q.discharged_by_staff_id = cs.staff_id
      AND q.status = 'Discharged'
      AND q.discharged_at::date = (NOW() AT TIME ZONE 'Africa/Johannesburg')::date
    GROUP BY cs.staff_id, cs.username, cs.role
    ORDER BY discharged_today DESC, cs.username ASC`);
  return result.rows;
}

module.exports = { checkIn, listStaffQueue, listPublicQueue, findActiveForHistory, setPriority, callToRoom, saveNotes, discharge, history, overview, dischargeLog, staffPerformance };
