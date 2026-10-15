'use strict';

const express = require('express');
const service = require('../services/intelligenceService');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');

const router = express.Router();
const admin = authorizeRoles('ADMIN');
const clinical = authorizeRoles('NURSE', 'DOCTOR', 'ADMIN');
const patientOps = authorizeRoles('RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN');
const referralCreate = authorizeRoles('RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN');

router.use(authenticate, requireReadyPassword);

router.get('/summary', admin, async (req, res, next) => {
  try { res.json(await service.getSummary()); } catch (error) { next(error); }
});
router.get('/events', admin, async (req, res, next) => {
  try { res.json(await service.listEvents({ limit: req.query.limit })); } catch (error) { next(error); }
});
router.get('/resources', clinical, async (req, res, next) => {
  try { res.json(await service.listResources()); } catch (error) { next(error); }
});
router.post('/resources', admin, async (req, res, next) => {
  try { res.status(201).json(await service.createResource(req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.patch('/resources/:resource_id', admin, async (req, res, next) => {
  try { res.json(await service.updateResource(req.params.resource_id, req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.get('/active-queue', clinical, async (req, res, next) => {
  try { res.json(await service.listActiveQueue()); } catch (error) { next(error); }
});
router.get('/pathways', clinical, async (req, res, next) => {
  try { res.json(await service.listPathways()); } catch (error) { next(error); }
});
router.get('/pathway-instances', clinical, async (req, res, next) => {
  try { res.json(await service.listPathwayInstances()); } catch (error) { next(error); }
});
router.post('/pathway-instances', clinical, async (req, res, next) => {
  try { res.status(201).json(await service.openPathway({ queueId: req.body?.queue_id, templateId: req.body?.template_id, actorStaffId: req.user.staff_id })); } catch (error) { next(error); }
});
router.patch('/pathway-instances/:instance_id/stages/:instance_stage_id', clinical, async (req, res, next) => {
  try { res.json(await service.updatePathwayStage({ instanceId: req.params.instance_id, instanceStageId: req.params.instance_stage_id, status: req.body?.status, actorStaffId: req.user.staff_id })); } catch (error) { next(error); }
});
router.get('/fairness', clinical, async (req, res, next) => {
  try { res.json(await service.getFairnessSnapshot()); } catch (error) { next(error); }
});
router.post('/simulations/flow', admin, async (req, res, next) => {
  try { res.status(201).json(await service.createFlowSimulation(req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.post('/simulations/synthetic-lab', admin, async (req, res, next) => {
  try { res.status(201).json(await service.runLab(req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.get('/simulations', admin, async (req, res, next) => {
  try { res.json(await service.listSimulations({ limit: req.query.limit })); } catch (error) { next(error); }
});
router.post('/forecasts/capture', admin, async (req, res, next) => {
  try { res.status(201).json(await service.captureForecast(req.user.staff_id)); } catch (error) { next(error); }
});
router.get('/forecasts', admin, async (req, res, next) => {
  try { res.json(await service.listForecasts({ limit: req.query.limit })); } catch (error) { next(error); }
});
router.patch('/forecasts/:forecast_id/actual', admin, async (req, res, next) => {
  try { res.json(await service.resolveForecast(req.params.forecast_id, req.body?.actual_wait_minutes, req.user.staff_id)); } catch (error) { next(error); }
});
router.get('/referrals', clinical, async (req, res, next) => {
  try { res.json(await service.listReferrals({ limit: req.query.limit })); } catch (error) { next(error); }
});
router.post('/referrals', referralCreate, async (req, res, next) => {
  try { res.status(201).json(await service.createReferral(req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.patch('/referrals/:referral_id/status', clinical, async (req, res, next) => {
  try { res.json(await service.updateReferralStatus(req.params.referral_id, req.body?.status, req.user.staff_id)); } catch (error) { next(error); }
});
router.get('/patients/:patient_id/contact-preferences', patientOps, async (req, res, next) => {
  try { res.json(await service.getContactPreference(req.params.patient_id)); } catch (error) { next(error); }
});
router.put('/patients/:patient_id/contact-preferences', authorizeRoles('RECEPTION', 'ADMIN'), async (req, res, next) => {
  try { res.json(await service.setContactPreference(req.params.patient_id, req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.post('/patients/:patient_id/wait-estimate-notifications', authorizeRoles('RECEPTION', 'ADMIN'), async (req, res, next) => {
  try { res.status(201).json(await service.sendWaitEstimate(req.params.patient_id, req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.post('/continuity/sync', patientOps, async (req, res, next) => {
  try { res.status(202).json(await service.submitContinuityObservation(req.body || {}, req.user.staff_id)); } catch (error) { next(error); }
});
router.get('/continuity/receipts', clinical, async (req, res, next) => {
  try { res.json(await service.listContinuityReceipts({ limit: req.query.limit })); } catch (error) { next(error); }
});

module.exports = router;