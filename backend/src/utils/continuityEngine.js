const ENGINE_VERSION = 'continuity-reconstruction-0.1.0';
const SCENARIO_CODE = 'RMSH_DOWNTIME_RECOVERY';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function integerInRange(value, fallback, min, max, label) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw httpError(label + ' must be an integer between ' + min + ' and ' + max + '.');
  }
  return parsed;
}

function normalizeScenario(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError('A continuity scenario object is required.');
  }
  const scenarioCode = String(input.scenario_code || SCENARIO_CODE).trim().toUpperCase();
  if (scenarioCode !== SCENARIO_CODE) {
    throw httpError('Only the built-in synthetic RMSH downtime scenario is currently supported.');
  }
  return {
    scenario_code: scenarioCode,
    seed: integerInRange(input.seed, 20261019, 1, 2147483647, 'seed'),
    outage_minutes: integerInRange(input.outage_minutes, 45, 45, 240, 'outage_minutes')
  };
}

function seededRandom(initialSeed) {
  let state = (Number(initialSeed) >>> 0) || 1;
  return function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const ALLOWED_TRANSITIONS = {
  START: ['REGISTERED'],
  REGISTERED: ['WAITING'],
  WAITING: ['TRIAGED', 'IN_CONSULTATION'],
  TRIAGED: ['IN_CONSULTATION'],
  IN_CONSULTATION: ['DISCHARGED'],
  DISCHARGED: []
};

function createSyntheticEvents(options) {
  const recoveryMinute = 10 + options.outage_minutes;
  const random = seededRandom(options.seed);
  const events = [];
  function add(eventRef, visitRef, state, occurredMinute, source = 'DIGITAL', recordedMinute = occurredMinute) {
    const lag = source === 'PAPER' ? Math.floor(random() * 4) : 0;
    events.push({
      source_event_ref: eventRef,
      visit_ref: visitRef,
      state,
      source,
      occurred_minute: occurredMinute,
      recorded_minute: source === 'PAPER' ? recoveryMinute + Math.max(1, recordedMinute) + lag : recordedMinute
    });
  }

  add('DIG-001-REG', 'SYN-VISIT-001', 'REGISTERED', 0);
  add('DIG-001-WAIT', 'SYN-VISIT-001', 'WAITING', 1);
  add('PAP-001-CALL', 'SYN-VISIT-001', 'IN_CONSULTATION', 18, 'PAPER', 2);
  add('PAP-001-CALL', 'SYN-VISIT-001', 'IN_CONSULTATION', 18, 'PAPER', 3);
  add('PAP-001-DIS', 'SYN-VISIT-001', 'DISCHARGED', 32, 'PAPER', 4);

  add('PAP-002-REG', 'SYN-VISIT-002', 'REGISTERED', 16, 'PAPER', 1);
  add('PAP-002-WAIT', 'SYN-VISIT-002', 'WAITING', 17, 'PAPER', 2);
  add('PAP-002-TRI', 'SYN-VISIT-002', 'TRIAGED', 26, 'PAPER', 3);
  add('PAP-002-CALL', 'SYN-VISIT-002', 'IN_CONSULTATION', 31, 'PAPER', 4);
  add('PAP-002-DIS', 'SYN-VISIT-002', 'DISCHARGED', 42, 'PAPER', 5);
  add('DIG-002-REG-MIRROR', 'SYN-VISIT-002', 'REGISTERED', 16, 'DIGITAL', recoveryMinute + 8);

  add('DIG-003-REG', 'SYN-VISIT-003', 'REGISTERED', 2);
  add('DIG-003-WAIT', 'SYN-VISIT-003', 'WAITING', 3);
  add('PAP-003-DIS', 'SYN-VISIT-003', 'DISCHARGED', 36, 'PAPER', 7);
  add('DIG-003-REOPEN', 'SYN-VISIT-003', 'WAITING', 37, 'DIGITAL', recoveryMinute + 9);

  add('DIG-004-REG', 'SYN-VISIT-004', 'REGISTERED', 4);
  add('DIG-004-WAIT', 'SYN-VISIT-004', 'WAITING', 5);
  add('PAP-004-CALL', 'SYN-VISIT-004', 'IN_CONSULTATION', 29, 'PAPER', 8);
  add('PAP-004-DIS', 'SYN-VISIT-004', 'DISCHARGED', 43, 'PAPER', 6);

  return events.map(event => ({
    ...event,
    occurred_during_outage: event.occurred_minute >= 10 && event.occurred_minute < recoveryMinute,
    recorded_after_recovery: event.recorded_minute >= recoveryMinute
  })).sort((a, b) => a.recorded_minute - b.recorded_minute || a.source_event_ref.localeCompare(b.source_event_ref));
}

function reconstructScenario(input = {}) {
  const options = normalizeScenario(input);
  const recoveryMinute = 10 + options.outage_minutes;
  const sourceEvents = createSyntheticEvents(options);
  const anomalies = [];
  const seenRefs = new Map();
  const seenSignatures = new Map();
  const uniqueEvents = [];

  for (const event of sourceEvents) {
    const refKey = event.source_event_ref;
    const signature = [event.visit_ref, event.state, event.occurred_minute].join('|');
    if (seenRefs.has(refKey)) {
      const previous = seenRefs.get(refKey);
      if (JSON.stringify({ visit_ref: previous.visit_ref, state: previous.state, occurred_minute: previous.occurred_minute }) !== JSON.stringify({ visit_ref: event.visit_ref, state: event.state, occurred_minute: event.occurred_minute })) {
        anomalies.push({ type: 'IDEMPOTENCY_KEY_CONFLICT', severity: 'HIGH', visit_ref: event.visit_ref, event_ref: refKey, message: 'A source event reference was reused with different event content.', requires_review: true });
      } else {
        anomalies.push({ type: 'DUPLICATE_EVENT', severity: 'LOW', visit_ref: event.visit_ref, event_ref: refKey, message: 'The same source event reference was received more than once; the replay was ignored.', requires_review: false });
      }
      continue;
    }
    seenRefs.set(refKey, event);
    if (seenSignatures.has(signature)) {
      anomalies.push({ type: 'SEMANTIC_DUPLICATE', severity: 'MEDIUM', visit_ref: event.visit_ref, event_ref: refKey, message: 'A second source reports the same visit state at the same simulated time.', requires_review: true });
      continue;
    }
    seenSignatures.set(signature, event);
    uniqueEvents.push(event);
    if (event.source === 'PAPER' && event.occurred_during_outage && event.recorded_after_recovery) {
      anomalies.push({ type: 'LATE_RECORDED_EVENT', severity: 'INFO', visit_ref: event.visit_ref, event_ref: refKey, message: 'An event occurred during the outage but was recorded after recovery.', requires_review: false });
    }
  }

  const visits = [];
  const visitRefs = [...new Set(uniqueEvents.map(event => event.visit_ref))].sort();
  for (const visitRef of visitRefs) {
    const visitEvents = uniqueEvents.filter(event => event.visit_ref === visitRef).sort((a, b) => a.occurred_minute - b.occurred_minute || a.recorded_minute - b.recorded_minute);
    let state = 'START';
    const accepted = [];
    for (const event of visitEvents) {
      const allowed = ALLOWED_TRANSITIONS[state] || [];
      if (!allowed.includes(event.state)) {
        anomalies.push({
          type: 'INVALID_TRANSITION', severity: 'HIGH', visit_ref: visitRef, event_ref: event.source_event_ref,
          from_state: state, proposed_state: event.state,
          message: 'The recorded transition from ' + state + ' to ' + event.state + ' is not permitted by the synthetic workflow model.',
          requires_review: true
        });
        continue;
      }
      accepted.push(event);
      state = event.state;
    }
    const reviewRequired = anomalies.some(item => item.visit_ref === visitRef && item.requires_review);
    visits.push({
      visit_ref: visitRef,
      reconstructed_state: state === 'START' ? null : state,
      disposition: reviewRequired ? 'REVIEW_REQUIRED' : (state === 'DISCHARGED' ? 'RECONSTRUCTED' : 'INCOMPLETE'),
      accepted_event_count: accepted.length,
      timeline: accepted.map(event => ({
        event_ref: event.source_event_ref, state: event.state, source: event.source,
        occurred_minute: event.occurred_minute, recorded_minute: event.recorded_minute
      }))
    });
  }

  for (const visitRef of visitRefs) {
    const byRecordingTime = uniqueEvents.filter(event => event.visit_ref === visitRef)
      .sort((a, b) => a.recorded_minute - b.recorded_minute || a.source_event_ref.localeCompare(b.source_event_ref));
    let maxOccurredMinute = -1;
    for (const event of byRecordingTime) {
      if (event.occurred_minute < maxOccurredMinute) {
        anomalies.push({
          type: 'RECORDING_ORDER_DIFFERS_FROM_OCCURRENCE_ORDER', severity: 'MEDIUM',
          visit_ref: visitRef, event_ref: event.source_event_ref,
          message: 'For this visit, a later-entered event appears to have occurred before an event already recorded. The reconstructed timeline is ordered by occurrence time; review the source evidence.',
          requires_review: true
        });
      }
      maxOccurredMinute = Math.max(maxOccurredMinute, event.occurred_minute);
    }
  }

  for (const visit of visits) {
    if (anomalies.some(item => item.visit_ref === visit.visit_ref && item.requires_review)) {
      visit.disposition = 'REVIEW_REQUIRED';
    }
  }

  const counts = type => anomalies.filter(item => item.type === type).length;
  return {
    engine_version: ENGINE_VERSION,
    scenario_code: options.scenario_code,
    source_scope: 'SYNTHETIC_ONLY',
    seed: options.seed,
    outage: { start_minute: 10, recovery_minute: recoveryMinute, duration_minutes: options.outage_minutes },
    assumptions: [
      'All visit references and records in this run are synthetic; no real patient records are read or changed.',
      'The timeline uses minutes relative to a simulated clinic session, not wall-clock timestamps.',
      'This workflow model checks operational sequence consistency only and is not a clinical protocol or a determination of what happened in a real clinic.',
      'Automatic duplicate suppression applies only to this synthetic analysis output; no source record is deleted or changed.'
    ],
    summary: {
      source_event_count: sourceEvents.length,
      unique_event_count: uniqueEvents.length,
      reconstructed_visit_count: visits.length,
      reconstructed_count: visits.filter(visit => visit.disposition === 'RECONSTRUCTED').length,
      review_required_count: visits.filter(visit => visit.disposition === 'REVIEW_REQUIRED').length,
      incomplete_count: visits.filter(visit => visit.disposition === 'INCOMPLETE').length,
      duplicate_event_count: counts('DUPLICATE_EVENT') + counts('SEMANTIC_DUPLICATE'),
      late_recorded_event_count: counts('LATE_RECORDED_EVENT'),
      invalid_transition_count: counts('INVALID_TRANSITION'),
      discrepancy_count: anomalies.filter(item => item.requires_review).length
    },
    events: sourceEvents,
    visits,
    anomalies
  };
}

module.exports = { ENGINE_VERSION, SCENARIO_CODE, normalizeScenario, reconstructScenario };
