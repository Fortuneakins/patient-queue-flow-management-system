'use strict';

const LONG_WAIT_THRESHOLD_MINUTES = 60;
const MINIMUM_SERVICE_HISTORY_SAMPLES = 8;
const STRONGER_SERVICE_HISTORY_SAMPLES = 32;

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function safeMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function signal({ code, severity, title, evidence, recommended_review, source }) {
  return { code, severity, title, evidence, recommended_review, source, automatic_action: false };
}

/**
 * Produce deterministic, explainable clinic-operations signals from aggregate
 * records. This function never reads patient identity or clinical note fields.
 * Every item is a prompt for authorised staff review, not an instruction to
 * change triage, diagnose, or take action automatically.
 */
function buildOperationalSignals(snapshot = {}) {
  const waiting = safeCount(snapshot.waiting);
  const inConsultation = safeCount(snapshot.in_consultation);
  const overdueWaiting = safeCount(snapshot.overdue_waiting);
  const oldestWait = safeMinutes(snapshot.oldest_wait_minutes);
  const serviceSamples = safeCount(snapshot.service_history_samples);
  const resources = Array.isArray(snapshot.resources) ? snapshot.resources : [];
  const signals = [];

  if (overdueWaiting > 0) {
    const severity = oldestWait !== null && oldestWait >= 180 ? 'CRITICAL' : 'WARNING';
    signals.push(signal({
      code: 'LONG_WAIT_REVIEW',
      severity,
      title: 'Long-waiting visits need staff review',
      evidence: `${overdueWaiting} waiting visit(s) have exceeded ${LONG_WAIT_THRESHOLD_MINUTES} minutes. Oldest recorded wait: ${oldestWait === null ? 'not available' : Math.round(oldestWait) + ' minutes'}.`,
      recommended_review: 'Review the live queue, staffing coverage and blocked operational stages. A clinician must retain responsibility for triage and priority decisions.',
      source: 'QUEUE_RECORDS'
    }));
  }

  if (waiting > 0 && inConsultation === 0) {
    signals.push(signal({
      code: 'WAITING_WITHOUT_ACTIVE_CONSULTATION',
      severity: 'WARNING',
      title: 'Waiting queue has no active consultation',
      evidence: `${waiting} visit(s) are waiting while the recorded in-consultation count is zero.`,
      recommended_review: 'Confirm whether clinical staff and rooms are available and whether call-to-room transitions are being recorded. Do not automatically change patient priority.',
      source: 'QUEUE_RECORDS'
    }));
  }

  if (waiting > 0 && serviceSamples < MINIMUM_SERVICE_HISTORY_SAMPLES) {
    signals.push(signal({
      code: 'SPARSE_SERVICE_HISTORY',
      severity: 'INFO',
      title: 'Historical timing evidence is still sparse',
      evidence: `${serviceSamples} valid completed consultation duration(s) are recorded in the 90-day analysis window; at least ${MINIMUM_SERVICE_HISTORY_SAMPLES} are required before pooled observations can replace the default service-time assumption.`,
      recommended_review: 'Treat forecasts as provisional and continue recording accurate call and discharge timestamps. Do not present fallback estimates as learned clinic performance.',
      source: 'COMPLETED_VISIT_TIMINGS'
    }));
  } else if (waiting > 0 && serviceSamples < STRONGER_SERVICE_HISTORY_SAMPLES) {
    signals.push(signal({
      code: 'LIMITED_SERVICE_HISTORY',
      severity: 'WATCH',
      title: 'Timing evidence is limited',
      evidence: `${serviceSamples} valid completed consultation duration(s) are available. Some priority tiers may still use pooled rather than tier-specific timing estimates.`,
      recommended_review: 'Review the sample counts by tier alongside the forecast, and continue collecting valid visit timings before relying on long-term comparisons.',
      source: 'COMPLETED_VISIT_TIMINGS'
    }));
  }

  const rooms = resources.filter(item => String(item.resource_type || '').toUpperCase() === 'ROOM');
  if (waiting > 0 && rooms.length === 0) {
    signals.push(signal({
      code: 'ROOM_REGISTRY_MISSING',
      severity: 'INFO',
      title: 'Room capacity cannot be verified from the resource registry',
      evidence: 'No ROOM resources are currently recorded in Clinic Intelligence.',
      recommended_review: 'Maintain the resource registry if staff intend to use capacity-related operational estimates. An empty registry does not prove that the physical clinic has no rooms.',
      source: 'RESOURCE_REGISTRY'
    }));
  } else if (waiting > 0 && rooms.length > 0) {
    const available = rooms
      .filter(item => String(item.status || '').toUpperCase() === 'AVAILABLE')
      .reduce((total, item) => total + safeCount(item.capacity), 0);
    const limited = rooms
      .filter(item => String(item.status || '').toUpperCase() === 'LIMITED')
      .reduce((total, item) => total + safeCount(item.capacity), 0);
    const unavailableCount = rooms
      .filter(item => String(item.status || '').toUpperCase() === 'UNAVAILABLE')
      .reduce((total, item) => total + safeCount(item.resource_count), 0);

    if (available === 0 && limited === 0) {
      signals.push(signal({
        code: 'NO_REGISTERED_ROOM_CAPACITY',
        severity: 'CRITICAL',
        title: 'No room capacity is marked available',
        evidence: `${unavailableCount} registered room resource(s) are marked unavailable and no room capacity is marked available or limited.`,
        recommended_review: 'Confirm resource statuses with clinic staff before interpreting the registry as a current operational constraint. No patient is re-prioritised automatically.',
        source: 'RESOURCE_REGISTRY'
      }));
    } else if (available === 0 && limited > 0) {
      signals.push(signal({
        code: 'ROOM_CAPACITY_LIMITED',
        severity: 'WARNING',
        title: 'Only limited room capacity is recorded',
        evidence: `${limited} unit(s) of capacity are recorded under LIMITED room resources; no room capacity is marked AVAILABLE.`,
        recommended_review: 'Confirm room readiness and actual usable capacity with responsible staff, then update the registry if it has changed.',
        source: 'RESOURCE_REGISTRY'
      }));
    }
  }

  const rank = { CRITICAL: 0, WARNING: 1, WATCH: 2, INFO: 3 };
  return signals.sort((left, right) => rank[left.severity] - rank[right.severity] || left.code.localeCompare(right.code));
}

module.exports = {
  LONG_WAIT_THRESHOLD_MINUTES,
  MINIMUM_SERVICE_HISTORY_SAMPLES,
  STRONGER_SERVICE_HISTORY_SAMPLES,
  buildOperationalSignals
};
