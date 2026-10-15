'use strict';

const express = require('express');
const { createRateLimiter } = require('../utils/rateLimit');
const smsService = require('../services/smsService');
const inboundService = require('../services/twilioInboundService');
const env = require('../config/env');

const router = express.Router();
const inboundLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

router.post('/twilio/inbound', express.urlencoded({ extended: false, limit: '16kb' }), inboundLimiter, async (req, res, next) => {
  if (!env.SMS_ENABLED || !env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WEBHOOK_URL) {
    return res.status(503).json({ error: 'Inbound SMS commands are not configured.' });
  }
  const verified = smsService.verifyInboundWebhookSignature({
    signature: req.get('X-Twilio-Signature'),
    params: req.body
  });
  if (!verified) return res.status(403).json({ error: 'Invalid webhook signature.' });

  try {
    const result = await inboundService.handleInboundCommand({
      from: req.body?.From,
      body: req.body?.Body,
      messageSid: req.body?.MessageSid
    });
    return res.status(200).type('text/xml').send(inboundService.buildTwiML(result.message));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
