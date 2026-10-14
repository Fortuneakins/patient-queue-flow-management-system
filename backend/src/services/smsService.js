const twilio = require('twilio');
const env = require('../config/env');

const client = env.SMS_ENABLED && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
  ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  : null;

async function sendCallNotification({ to, ticketNumber }) {
  if (!env.SMS_ENABLED) return { sent: false, skipped: true, reason: 'disabled' };
  if (!client || !env.TWILIO_PHONE_NUMBER) return { sent: false, skipped: true, reason: 'not-configured' };
  await client.messages.create({
    body: `RMSH: Ticket ${ticketNumber}, please proceed to the consultation room.`,
    from: env.TWILIO_PHONE_NUMBER,
    to
  });
  return { sent: true };
}
module.exports = { sendCallNotification };
