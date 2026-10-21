const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClinicInsights, MODEL_VERSION } = require('../../src/services/clinicInsightEngine');

test('combines staffing, queue delay, provenance and history into transparent prompts', () => {
  const result = buildClinicInsights({
    waiting: 7,
    in_consultation: 2,
    overdue_waiting: 3,
    oldest_wait_minutes: 88.5,
    on_duty_doctors: 0,
    resource_issues: 1,
    unclassified_completed: 3,
    unclassified_active: 1,
    service_history_samples: 2,
    generated_at: '2026-10-21T04:00:00.000Z'
  });
  assert.equal(result.model_version, MODEL_VERSION);
  assert.equal(result.source, 'SERVER_RULES');
  assert.equal(result.generated_at, '2026-10-21T04:00:00.000Z');
  assert.equal(result.insights[0].severity, 'CRITICAL');
  assert.equal(result.insights[0].id, 'active-queue-no-rostered-doctor');
  assert.ok(result.insights.some(item => item.id === 'waiting-delay-threshold'));
  assert.ok(result.insights.some(item => item.id === 'resource-constraints'));
  assert.ok(result.insights.some(item => item.id === 'data-provenance-unresolved'));
  assert.ok(result.insights.some(item => item.id === 'limited-operational-history'));
  for (const item of result.insights) {
    assert.ok(item.rule_id);
    assert.ok(item.summary);
    assert.ok(item.evidence.length > 0);
    assert.ok(item.recommended_action);
    assert.equal(item.human_review_required, true);
  }
});

test('does not emit queue-pressure or zero-staff warnings from missing queue counts', () => {
  const result = buildClinicInsights({
    waiting: null,
    in_consultation: undefined,
    overdue_waiting: null,
    on_duty_doctors: null,
    resource_issues: 0,
    unclassified_completed: 0,
    unclassified_active: 0,
    service_history_samples: 10
  });
  assert.equal(result.insights.length, 1);
  assert.equal(result.insights[0].id, 'no-threshold-signal');
  assert.match(result.insights[0].recommended_action, /not a safety clearance/);
});

test('sorts severity deterministically and never recommends changing triage', () => {
  const result = buildClinicInsights({
    waiting: 2,
    in_consultation: 1,
    overdue_waiting: 1,
    oldest_wait_minutes: 75,
    on_duty_doctors: 0,
    resource_issues: 0,
    unclassified_completed: 0,
    unclassified_active: 0,
    service_history_samples: 10
  });
  assert.deepEqual(result.insights.map(item => item.severity).slice(0, 2), ['CRITICAL', 'CRITICAL']);
  assert.ok(result.insights.every(item => !/automatically assign|automatically change/i.test(item.recommended_action)));
});
