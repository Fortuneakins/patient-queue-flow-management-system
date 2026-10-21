const MODEL_VERSION = 'clinic-insight-rules-1.0.0';
const MINIMUM_SERVICE_SAMPLES = 5;
const SEVERITY_ORDER = Object.freeze({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 });

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function buildClinicInsights(snapshot = {}) {
  const waiting = integer(snapshot.waiting);
  const inConsultation = integer(snapshot.in_consultation);
  const active = waiting + inConsultation;
  const overdue = integer(snapshot.overdue_waiting);
  const doctors = snapshot.on_duty_doctors === null || snapshot.on_duty_doctors === undefined
    ? null
    : integer(snapshot.on_duty_doctors);
  const resourceIssues = integer(snapshot.resource_issues);
  const unclassifiedCompleted = integer(snapshot.unclassified_completed);
  const unclassifiedActive = integer(snapshot.unclassified_active);
  const serviceSamples = integer(snapshot.service_history_samples);
  const insights = [];

  if (active > 0 && doctors === 0) {
    insights.push({
      id: 'active-queue-no-rostered-doctor',
      rule_id: 'CAPACITY-001',
      severity: 'CRITICAL',
      title: 'Active queue with no rostered doctor',
      summary: 'The queue has active work but the shift registry reports no active doctor on duty.',
      evidence: [
        `Active visits: ${active} (${waiting} waiting, ${inConsultation} in consultation).`,
        'Rostered doctors on duty: 0.'
      ],
      recommended_action: 'Verify the roster and actual available clinical capacity with the shift coordinator. Do not change assigned triage tiers automatically.',
      tool: 'resources',
      human_review_required: true
    });
  }

  if (overdue > 0) {
    insights.push({
      id: 'waiting-delay-threshold',
      rule_id: 'FLOW-001',
      severity: doctors === 0 ? 'CRITICAL' : 'HIGH',
      title: `${overdue} waiting visit${overdue === 1 ? '' : 's'} crossed the delay-review threshold`,
      summary: 'Waiting age crossed the configured 60-minute operational review threshold.',
      evidence: [
        `Visits over 60 minutes: ${overdue}.`,
        `Oldest waiting age: ${snapshot.oldest_wait_minutes == null ? 'unavailable' : `${Number(snapshot.oldest_wait_minutes).toFixed(1)} minutes`}.`
      ],
      recommended_action: 'Ask authorised clinical staff to review the operational context and roster. This is not a recommendation to change clinical priority.',
      tool: 'learning',
      human_review_required: true
    });
  }

  if (resourceIssues > 0) {
    insights.push({
      id: 'resource-constraints',
      rule_id: 'RESOURCE-001',
      severity: 'HIGH',
      title: `${resourceIssues} resource record${resourceIssues === 1 ? '' : 's'} need attention`,
      summary: 'One or more room, equipment, service or supply records are marked Limited or Unavailable.',
      evidence: [`Resource records requiring review: ${resourceIssues}.`],
      recommended_action: 'Confirm the recorded state with the responsible administrator before using it as a planning assumption.',
      tool: 'resources',
      human_review_required: true
    });
  }

  if (unclassifiedCompleted > 0 || unclassifiedActive > 0) {
    insights.push({
      id: 'data-provenance-unresolved',
      rule_id: 'DATA-001',
      severity: 'MEDIUM',
      title: 'Queue provenance needs review',
      summary: 'Some visits have no verified provenance and are not included in historical operational performance statistics.',
      evidence: [
        `Completed unclassified visits: ${unclassifiedCompleted}.`,
        `Active unclassified visits: ${unclassifiedActive}.`
      ],
      recommended_action: 'Review the origin of historical records using reliable audit or test evidence. Do not infer provenance from names, ticket numbers or symptoms.',
      tool: 'provenance',
      human_review_required: true
    });
  }

  if (serviceSamples < MINIMUM_SERVICE_SAMPLES) {
    insights.push({
      id: 'limited-operational-history',
      rule_id: 'MODEL-001',
      severity: 'MEDIUM',
      title: 'Limited operational service-time evidence',
      summary: 'There are too few eligible operational consultation-duration observations for a history-calibrated estimate.',
      evidence: [
        `Eligible operational service-time samples: ${serviceSamples}.`,
        `Minimum sample count before using the observed median: ${MINIMUM_SERVICE_SAMPLES}.`
      ],
      recommended_action: 'Treat wait estimates as baseline-assumption planning guidance until at least five valid operational observations are available; review them again when evidence accumulates.',
      tool: 'learning',
      human_review_required: true
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'no-threshold-signal',
      rule_id: 'SYSTEM-001',
      severity: 'INFO',
      title: 'No configured rule has triggered a review prompt',
      summary: 'The loaded aggregate snapshot has not crossed the current queue, resource, provenance or evidence thresholds.',
      evidence: [
        `Waiting: ${waiting}; in consultation: ${inConsultation}; overdue waiting: ${overdue}.`,
        `Eligible operational service-time samples: ${serviceSamples}.`
      ],
      recommended_action: 'Continue normal monitoring. The absence of a rule-based prompt is not a safety clearance or a statement that the clinic has no risks.',
      tool: null,
      human_review_required: true
    });
  }

  insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule_id.localeCompare(b.rule_id));
  return {
    model_version: MODEL_VERSION,
    generated_at: snapshot.generated_at || new Date().toISOString(),
    source: 'SERVER_RULES',
    decision_boundary: 'Operational decision support only; no diagnosis, triage assignment or automatic queue action.',
    insights
  };
}

module.exports = { MODEL_VERSION, MINIMUM_SERVICE_SAMPLES, buildClinicInsights };
