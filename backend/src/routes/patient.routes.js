const express = require('express');
const patientService = require('../services/patientService');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const { createRateLimiter } = require('../utils/rateLimit');

const router = express.Router();
const kioskVerifyLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 });

router.get('/', authenticate, requireReadyPassword, authorizeRoles('RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN'), async (req, res, next) => {
  try { res.json(await patientService.searchPatients(req.query.q)); } catch (error) { next(error); }
});

router.get('/verify/:identification_number', kioskVerifyLimiter, async (req, res, next) => {
  try {
    const id = String(req.params.identification_number || '').trim().toUpperCase();
    if (id.length < 4 || id.length > 20) return res.status(400).json({ error: 'A valid identification number is required.' });
    const patient = await patientService.publicVerify(id);
    if (!patient) return res.status(404).json({ error: 'No patient record found for that identification number.' });
    res.json({ first_name: String(patient.full_name).trim().split(/\s+/)[0] });
  } catch (error) { next(error); }
});

router.post('/', authenticate, requireReadyPassword, authorizeRoles('RECEPTION', 'ADMIN'), async (req, res, next) => {
  try { res.status(201).json(await patientService.createPatient(req.body || {})); } catch (error) { next(error); }
});

module.exports = router;
