'use strict';

const { query, withTransaction } = require('../db/pool');

const STOP_COMMANDS = new Set(['STOP', 'STOP ALL', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT']);
const START_COMMANDS = new Set(['START', 'YES', 'UNSTOP']);

function classifyCommand(body) {
  const command = String(body ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (STOP_COMMANDS.has(command)) return 'STOP';
  if (START_COMMANDS.has(command)) return 'START';
  if (command === 'HELP' || command === 'INFO') return 'HELP';
  return 'UNKNOWN';
}

function normalizePhone(value) {
  const phone = String(value ?? '').trim();
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

function buildTwiML(message) {
  const escaped = String(message ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + escaped + '</Message></Response>';
}

async function recordConsentEvent(client, patientId, eventType) {
  await client.query(
    "INSERT INTO operational_events(event_type, entity_type, entity_id, actor_staff_id, event_source, details) VALUES ($1, 'patient_contact_preference', $2, NULL, 'SYSTEM', $3::jsonb)",
    [eventType, String(patientId), JSON.stringify({ channel: 'SMS', source: 'twilio_inbound_command' })]
  );
}

async function handleInboundCommand({ from, body, messageSid }) {
  const command = classifyCommand(body);
  if (command === 'HELP') {
    return { message: 'PQFMS clinic updates: reply START to request SMS queue updates or STOP to stop them. Estimated waits can change. For assistance, contact clinic reception.' };
  }
  if (command === 'UNKNOWN') {
    return { message: 'We could not recognise that command. Reply HELP for instructions, START to request queue updates, or STOP to stop them.' };
  }

  const phone = normalizePhone(from);
  const sid = String(messageSid ?? '').trim();
  if (!phone) return { message: 'We could not verify this number format. Please contact clinic reception to manage queue notifications.' };
  if (!/^SM[0-9a-fA-F]{32}$/.test(sid)) return { message: 'We could not verify this message. Please contact clinic reception to manage queue notifications.' };

  return withTransaction(async client => {
    const receipt = await client.query(
      "INSERT INTO twilio_inbound_command_receipts(message_sid, command) VALUES ($1,$2) ON CONFLICT (message_sid) DO NOTHING RETURNING message_sid",
      [sid, command]
    );
    if (!receipt.rows[0]) {
      const existing = await client.query('SELECT command, result_code FROM twilio_inbound_command_receipts WHERE message_sid=$1', [sid]);
      if (!existing.rows[0] || existing.rows[0].command !== command) {
        return { message: 'This message could not be processed again. Please contact clinic reception if you need help.' };
      }
      const messages = {
        CONSENT_WITHDRAWN: 'SMS queue notifications are switched off for this number.',
        CONSENT_GRANTED: 'Your request for SMS queue updates has already been recorded.',
        NO_MATCH: 'No matching patient contact was found. Please ask reception to review your contact details.',
        AMBIGUOUS_PHONE: 'This number matches more than one patient record. Please ask reception to manage SMS consent safely.'
      };
      return { message: messages[existing.rows[0].result_code] || 'This request has already been received.' };
    }

    const matches = await client.query(
      'SELECT patient_id FROM patients WHERE contact_no=$1 ORDER BY patient_id FOR UPDATE',
      [phone]
    );
    let resultCode;
    let response;
    if (command === 'STOP') {
      for (const row of matches.rows) {
        await client.query(
          "INSERT INTO patient_contact_preferences(patient_id, channel, opted_in, consent_source, updated_by_staff_id, consented_at, updated_at) VALUES ($1,'SMS',FALSE,'PATIENT_REQUEST',NULL,NULL,NOW()) ON CONFLICT (patient_id, channel) DO UPDATE SET opted_in=FALSE, consent_source='PATIENT_REQUEST', updated_by_staff_id=NULL, consented_at=NULL, updated_at=NOW()",
          [row.patient_id]
        );
        await recordConsentEvent(client, row.patient_id, 'sms_consent_withdrawn');
      }
      resultCode = matches.rows.length ? 'CONSENT_WITHDRAWN' : 'NO_MATCH';
      response = matches.rows.length
        ? 'SMS queue notifications are switched off for this number. Contact reception if you want to update your preferences.'
        : 'No matching patient contact was found. Please ask reception to review your contact details.';
    } else if (matches.rows.length !== 1) {
      resultCode = matches.rows.length === 0 ? 'NO_MATCH' : 'AMBIGUOUS_PHONE';
      response = matches.rows.length === 0
        ? 'No matching patient contact was found. Please ask reception to review your contact details.'
        : 'This number matches more than one patient record. Please ask reception to manage SMS consent safely.';
    } else {
      const patientId = matches.rows[0].patient_id;
      await client.query(
        "INSERT INTO patient_contact_preferences(patient_id, channel, opted_in, consent_source, updated_by_staff_id, consented_at, updated_at) VALUES ($1,'SMS',TRUE,'PATIENT_REQUEST',NULL,NOW(),NOW()) ON CONFLICT (patient_id, channel) DO UPDATE SET opted_in=TRUE, consent_source='PATIENT_REQUEST', updated_by_staff_id=NULL, consented_at=NOW(), updated_at=NOW()",
        [patientId]
      );
      await recordConsentEvent(client, patientId, 'sms_consent_granted');
      resultCode = 'CONSENT_GRANTED';
      response = 'Your request for SMS queue updates has been recorded. Wait estimates are approximate and may change.';
    }
    await client.query('UPDATE twilio_inbound_command_receipts SET result_code=$1, processed_at=NOW() WHERE message_sid=$2', [resultCode, sid]);
    return { message: response, result_code: resultCode };
  });
}

module.exports = { classifyCommand, normalizePhone, buildTwiML, handleInboundCommand };
