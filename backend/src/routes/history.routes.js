const express = require('express');
const queueService = require('../services/queueService');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const router = express.Router();

router.get('/', authenticate, requireReadyPassword, authorizeRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res, next) => {
  try {
    const data = await queueService.history({ identificationNumber: req.query.identification_number, role: req.user.role, limit: req.query.limit, offset: req.query.offset });
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/overview', authenticate, requireReadyPassword, authorizeRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res, next) => {
  try { res.json(await queueService.overview()); } catch (error) { next(error); }
});

router.get('/discharge-log', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { res.json(await queueService.dischargeLog({ limit: req.query.limit, offset: req.query.offset })); } catch (error) { next(error); }
});

router.get('/staff-performance', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { res.json(await queueService.staffPerformance()); } catch (error) { next(error); }
});

module.exports = router;
