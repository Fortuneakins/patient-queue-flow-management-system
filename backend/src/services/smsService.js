const twilio = require('twilio');
const env = require('../config/env');

const client = env.SMS_ENABLED && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
  ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  : null;

async function deliver({ to, body }) {
  if (!env.SMS_ENABLED) return { sent: false, skipped: true, reason: 'disabled' };
  if (!client || !env.TWILIO_PHONE_NUMBER) return { sent: false, skipped: true, reason: 'not-configured' };
  if (!to) return { sent: false, skipped: true, reason: 'missing-contact' };
  const result = await client.messages.create({ body, from: env.TWILIO_PHONE_NUMBER, to });
  return { sent: true, provider_reference: result.sid || null };
}

async function sendCallNotification({ to, ticketNumber }) {
  return deliver({
    to,
    body: 'RMSH: Ticket ' + String(ticketNumber).slice(0, 12) + ', please proceed to the consultation room.'
  });
}

async function sendWaitEstimate({ to, estimatedWaitMinutes }) {
  const wait = Math.max(0, Math.min(1440, Math.round(Number(estimatedWaitMinutes) || 0)));
  return deliver({
    to,
    body: 'RMSH queue update: your estimated wait is about ' + wait + ' minutes. This is an estimate and may change. Please remain available and follow clinic staff instructions.'
  });
}

module.exports = { sendCallNotification, sendWaitEstimate };
