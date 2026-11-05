process.env.JWT_SECRET = 'unit-test-secret-with-at-least-32-characters-123456';
process.env.INTERNAL_SERVICE_TOKEN = 'unit-internal-token';
process.env.SMS_ENABLED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePhone,
  validateSouthAfricanId,
  validatePatientPayload,
  validateTier,
  validateUsername,
  validatePassword,
  normalizeRole
} = require('../../src/utils/validation');

function validSaIdFor2000Birthday() {
  // 0001014800088: 01 Jan 2000, citizenship digits 48; check digit 8.
  return '0001014800088';
}

test('normalizes South African mobile numbers to E.164', () => {
  assert.equal(normalizePhone('082 123 4567'), '+27821234567');
  assert.equal(normalizePhone('+27821234567'), '+27821234567');
  assert.equal(normalizePhone('0211234567'), null);
});

test('validates SA ID structure, birth date and check digit', () => {
  const id = validSaIdFor2000Birthday();
  const result = validateSouthAfricanId(id);
  assert.equal(result.valid, true);
  assert.equal(result.date_of_birth, '2000-01-01');
  assert.equal(validateSouthAfricanId(id.slice(0, -1) + '9').valid, false);
});

test('validates patient registration payload and derives SA ID birth date', () => {
  const result = validatePatientPayload({
    identification_type: 'SA_ID',
    identification_number: validSaIdFor2000Birthday(),
    full_name: 'Test Patient',
    date_of_birth: '',
    contact_no: '0821234567'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    identification_type: 'SA_ID',
    identification_number: validSaIdFor2000Birthday(),
    full_name: 'Test Patient',
    date_of_birth: '2000-01-01',
    contact_no: '+27821234567'
  });
});

test('requires a valid tier 1–4', () => {
  assert.equal(validateTier('1'), 1);
  assert.equal(validateTier(4), 4);
  assert.equal(validateTier(5), null);
  assert.equal(validateTier('high'), null);
});

test('enforces username and password constraints', () => {
  assert.equal(validateUsername('doctor_demo'), true);
  assert.equal(validateUsername('a'), false);
  assert.equal(validatePassword('12345678'), true);
  assert.equal(validatePassword('1234567'), false);
});

test('normalizes roles consistently', () => {
  assert.equal(normalizeRole(' doctor '), 'DOCTOR');
});


test('requires a stronger password policy in production without breaking local demo fixtures', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(validatePassword('12345678'), false);
    assert.equal(validatePassword('LongerProduction1!'), true);
    assert.equal(validatePassword('Demo' + 'Pass2026!'), false);
    assert.equal(validatePassword('alllowercase12345!'), false);
    assert.equal(validatePassword('ALLUPPERCASE12345!'), false);
    assert.equal(validatePassword('NoDigitsOrSymbolHere'), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
