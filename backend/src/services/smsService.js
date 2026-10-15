const twilio = require('twilio');
const env = require('../config/env');

const client = env.SMS_ENABLED && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
  ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  : null;

async function sendCallNotification({ to, ticketNumber }) {
  if (!env.SMS_ENABLED) return { sent: false, skipped: true, reason: 'disabled' };
  if (!client || !env.TWILIO_PHONE_NUMBER) return { sent: false, skipped: true, reason: 'not-configured' };
  if (!to) return { sent: false, skipped: true, reason: 'missing-contact' };
  await client.messages.create({
    body: `RMSH: Ticket ${ticketNumber}, please proceed to the consultation room.`,
    from: env.TWILIO_PHONE_NUMBER,
    to
  });
  return { sent: true };
}

// Access Bridge messages are deliberately limited to operational updates. They never
// disclose symptoms, diagnoses, triage priority or consultation notes. English is
// the only approved template language until translations receive native-speaker review.
async function sendAccessUpdate({ to, templateCode, waitMinutes, language = 'en' }) {
  if (!env.SMS_ENABLED) return { status: 'SKIPPED', reason: 'sms-disabled' };
  if (!client || !env.TWILIO_PHONE_NUMBER) return { status: 'SKIPPED', reason: 'provider-not-configured' };
  if (!to) return { status: 'FAILED', reason: 'missing-contact' };
  const template = String(templateCode || '').toUpperCase();
  if (!['WAIT_ESTIMATE', 'SERVICE_DELAY'].includes(template)) {
    throw Object.assign(new Error('Unsupported access update template.'), { status: 400 });
  }
  let body;
  if (template === 'WAIT_ESTIMATE') {
    const estimate = Number(waitMinutes);
    if (!Number.isFinite(estimate) || estimate < 0 || estimate > 1440) {
      throw Object.assign(new Error('waitMinutes must be between 0 and 1440.'), { status: 400 });
    }
    body = `RMSH clinic update: your estimated wait is about ${Math.round(estimate)} minutes. This is an estimate and may change. Please alert clinic staff if your condition worsens.`;
  } else {
    body = 'RMSH clinic update: there is an operational delay. This update is not a clinical assessment. Please alert clinic staff if your condition worsens.';
  }
  const message = await client.messages.create({ body, from: env.TWILIO_PHONE_NUMBER, to });
  return { status: 'SENT', providerMessageId: message.sid || null, reason: String(language).toLowerCase() === 'en' ? 'sent' : 'sent-english-template-pending-reviewed-translation' };
}
module.exports = { sendCallNotification, sendAccessUpdate };
