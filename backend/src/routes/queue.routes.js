const express = require('express');
const queueService = require('../services/queueService');
const flowAnalyticsService = require('../services/flowAnalyticsService');
const env = require('../config/env');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const { createRateLimiter } = require('../utils/rateLimit');

const router = express.Router();
const kioskLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 });

async function emitQueueUpdate(req) {
  req.app.get('io')?.emit('queue_updated');
}

// Calibration evidence is collected automatically from real operational queue
// transitions only. Test/demo modes never create operational truth samples.
// This is intentionally fire-and-forget so a forecast write can never block a
// check-in, priority change, doctor call, or discharge.
function captureOperationalForecast(req) {
  if (env.DATA_PROVENANCE_MODE !== 'OPERATIONAL') return;

  setImmediate(() => {
    flowAnalyticsService.recordForecast(
      { horizon_minutes: 60 },
      req.user?.staff_id ?? null
    ).catch(() => {
      // Keep patient-flow operations successful if the optional ledger is down.
      console.warn('[forecast-truth] Automatic operational snapshot capture failed.');
    });
  });
}

router.get('/public', async (req, res, next) => {
  try { res.json(await queueService.listPublicQueue()); } catch (error) { next(error); }
});

router.get('/', authenticate, requireReadyPassword, authorizeRoles('NURSE', 'DOCTOR'), async (req, res, next) => {
  try { res.json(await queueService.listStaffQueue()); } catch (error) { next(error); }
});

router.post('/check-in', kioskLimiter, async (req, res, next) => {
  try {
    const result = await queueService.checkIn({ identificationNumber: req.body?.identification_number, symptoms: req.body?.symptoms });
    if (result.duplicate) return res.status(409).json({ error: 'This patient already has an active visit.', ticket_number: result.ticket_number });
    await emitQueueUpdate(req);
    captureOperationalForecast(req);
    res.status(201).json(result.visit);
  } catch (error) { next(error); }
});

router.post('/', authenticate, requireReadyPassword, authorizeRoles('RECEPTION', 'ADMIN'), async (req, res, next) => {
  try {
    const result = await queueService.checkIn({ patientId: req.body?.patient_id, symptoms: req.body?.symptoms });
    if (result.duplicate) return res.status(409).json({ error: 'This patient already has an active visit.', ticket_number: result.ticket_number });
    await emitQueueUpdate(req);
    captureOperationalForecast(req);
    res.status(201).json(result.visit);
  } catch (error) { next(error); }
});

router.put('/:queue_id/priority', authenticate, requireReadyPassword, authorizeRoles('NURSE', 'DOCTOR'), async (req, res, next) => {
  try { const result = await queueService.setPriority(req.params.queue_id, req.body?.priority_level, req.user.staff_id); await emitQueueUpdate(req); captureOperationalForecast(req); res.json(result); } catch (error) { next(error); }
});

router.put('/:queue_id/call', authenticate, requireReadyPassword, authorizeRoles('DOCTOR'), async (req, res, next) => {
  try { const result = await queueService.callToRoom(req.params.queue_id, req.user.staff_id); await emitQueueUpdate(req); captureOperationalForecast(req); res.json(result); } catch (error) { next(error); }
});

router.put('/:queue_id/notes', authenticate, requireReadyPassword, authorizeRoles('DOCTOR'), async (req, res, next) => {
  try { res.json(await queueService.saveNotes(req.params.queue_id, req.body?.doctor_notes, req.user.staff_id)); } catch (error) { next(error); }
});

router.put('/:queue_id/discharge', authenticate, requireReadyPassword, authorizeRoles('DOCTOR'), async (req, res, next) => {
  try { const result = await queueService.discharge(req.params.queue_id, req.user.staff_id); await emitQueueUpdate(req); captureOperationalForecast(req); res.json(result); } catch (error) { next(error); }
});

module.exports = router;
