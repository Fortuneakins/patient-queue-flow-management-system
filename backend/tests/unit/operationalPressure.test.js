const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationalPressure, MODEL_VERSION } = require('../../src/services/operationalPressure');

test('builds a deterministic critical pressure score from queue, roster and room evidence', () => {
  const result = buildOperationalPressure({ waiting:10, in_consultation:2, overdue_waiting:6, on_duty_doctors:0, available_room_capacity:0 });
  assert.equal(result.model_version,MODEL_VERSION);
  assert.equal(result.score,86);
  assert.equal(result.band,'CRITICAL');
  assert.equal(result.waiting_per_doctor,null);
  assert.equal(result.components.reduce((sum,item)=>sum+item.points,0),86);
});

test('reports low pressure for an empty waiting queue without active work', () => {
  const result = buildOperationalPressure({ waiting:0, in_consultation:0, overdue_waiting:0, on_duty_doctors:1, available_room_capacity:2 });
  assert.equal(result.score,0);
  assert.equal(result.band,'LOW');
  assert.equal(result.waiting_per_doctor,0);
});

test('does not manufacture a score when queue counts are unavailable', () => {
  const result = buildOperationalPressure({ waiting:null, in_consultation:1, on_duty_doctors:0 });
  assert.equal(result.score,null);
  assert.equal(result.band,'UNAVAILABLE');
  assert.deepEqual(result.components,[]);
});
