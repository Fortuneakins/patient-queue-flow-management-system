const express = require('express');
const authService = require('../services/authService');
const { authenticate, authorizeRoles, authorizeRolesOrPermission, requireReadyPassword } = require('../middleware/authenticate');

const router = express.Router();

router.get('/', authenticate, requireReadyPassword, authorizeRolesOrPermission(['ADMIN'], 'VIEW_STAFF_DIRECTORY'), async (req, res, next) => {
  try { res.json(await authService.listStaff()); } catch (error) { next(error); }
});

router.put('/:staff_id/status', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try {
    if (typeof req.body?.is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be true or false.' });
    res.json(await authService.updateStatus(req.params.staff_id, req.body.is_active, req.user.staff_id));
  } catch (error) { next(error); }
});

router.put('/:staff_id/permissions', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { res.json(await authService.setPermission(req.params.staff_id, req.body?.permission, req.body?.grant)); } catch (error) { next(error); }
});

router.get('/:staff_id/logins', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try { res.json(await authService.loginHistory(req.params.staff_id)); } catch (error) { next(error); }
});

module.exports = router;
