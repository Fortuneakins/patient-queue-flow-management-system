const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOperationalSignals,
  MINIMUM_SERVICE_HISTORY_SAMPLES
} = require('../../src/utils/operationalSignalEngine');

test('long waits, empty consultation capacity and sparse history produce explainable review signals', () => {
  const signals = buildOperationalSignals({
    waiting: 5,
    in_consultation: 0,
    overdue_waiting: 2,
    oldest_wait_minutes: 205,
    service_history_samples: 3,
    resources: []
  });

  assert.deepEqual(signals.map(item => item.severity), ['CRITICAL', 'WARNING', 'INFO', 'INFO']);
  assert.deepEqual(signals.map(item => item.code), [
    'LONG_WAIT_REVIEW',
    'WAITING_WITHOUT_ACTIVE_CONSULTATION',
    'ROOM_REGISTRY_MISSING',
    'SPARSE_SERVICE_HISTORY'
  ]);
  assert.ok(signals.every(item => item.automatic_action === false));
  assert.ok(signals.every(item => item.recommended_review.length > 0));
  assert.ok(signals.every(item => !('patient_id' in item) && !('full_name' in item)));
});

test('a mature timing history and available room resource do not produce false alerts', () => {
  const signals = buildOperationalSignals({
    waiting: 4,
    in_consultation: 2,
    overdue_waiting: 0,
    oldest_wait_minutes: 18,
    service_history_samples: 60,
    resources: [
      { resource_type: 'ROOM', status: 'AVAILABLE', resource_count: 3, capacity: 3 },
      { resource_type: 'ROOM', status: 'UNAVAILABLE', resource_count: 1, capacity: 1 }
    ]
  });

  assert.deepEqual(signals, []);
});

test('limited room capacity is flagged but not interpreted as proof the clinic has no rooms', () => {
  const signals = buildOperationalSignals({
    waiting: 2,
    in_consultation: 1,
    overdue_waiting: 0,
    oldest_wait_minutes: 22,
    service_history_samples: MINIMUM_SERVICE_HISTORY_SAMPLES,
    resources: [
      { resource_type: 'ROOM', status: 'LIMITED', resource_count: 2, capacity: 2 },
      { resource_type: 'ROOM', status: 'UNAVAILABLE', resource_count: 1, capacity: 1 }
    ]
  });

  const rooms = signals.find(item => item.code === 'ROOM_CAPACITY_LIMITED');
  assert.ok(rooms);
  assert.equal(rooms.severity, 'WARNING');
  assert.match(rooms.recommended_review, /Confirm room readiness/);
  assert.equal(signals.some(item => item.code === 'NO_REGISTERED_ROOM_CAPACITY'), false);
});

test('all-unavailable room registry is explicitly qualified as recorded state', () => {
  const signals = buildOperationalSignals({
    waiting: 1,
    in_consultation: 0,
    overdue_waiting: 0,
    oldest_wait_minutes: 4,
    service_history_samples: 45,
    resources: [
      { resource_type: 'ROOM', status: 'UNAVAILABLE', resource_count: 2, capacity: 2 }
    ]
  });

  const roomSignal = signals.find(item => item.code === 'NO_REGISTERED_ROOM_CAPACITY');
  assert.equal(roomSignal.severity, 'CRITICAL');
  assert.match(roomSignal.evidence, /registered room resource/);
  assert.match(roomSignal.recommended_review, /Confirm resource statuses/);
});

test('invalid numeric fields are handled as missing rather than crashing signal generation', () => {
  const signals = buildOperationalSignals({
    waiting: 'invalid',
    in_consultation: null,
    overdue_waiting: Number.NaN,
    oldest_wait_minutes: 'unknown',
    service_history_samples: 'unknown',
    resources: 'not-an-array'
  });

  assert.deepEqual(signals, []);
});
