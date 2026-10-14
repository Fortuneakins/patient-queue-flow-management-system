const express = require('express');
const shiftService = require('../services/shiftService');
const { authenticate, authorizeRoles, requireReadyPassword, requireInternalService } = require('../middleware/authenticate');
const router = express.Router();

router.post('/', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { res.status(201).json(await shiftService.createShift({ staffId: req.body?.staff_id, shiftDate: req.body?.shift_date, startTime: req.body?.start_time, endTime: req.body?.end_time })); } catch (error) { next(error); }
});

router.get('/', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { res.json(await shiftService.listShifts({ date: req.query.date })); } catch (error) { next(error); }
});

router.delete('/:shift_id', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { await shiftService.deleteShift(req.params.shift_id); res.json({ message: 'Shift removed.' }); } catch (error) { next(error); }
});

router.get('/on-duty', requireInternalService, async (req, res, next) => {
  try { res.json({ on_duty: await shiftService.getOnDutyCount() }); } catch (error) { next(error); }
});

module.exports = router;
