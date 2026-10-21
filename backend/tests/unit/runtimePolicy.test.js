const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig } = require('../../src/config/runtimePolicy');

const validProductionConfig = {
  nodeEnv: 'production',
  jwtSecret: 'a'.repeat(56),
  internalServiceToken: 'b'.repeat(48),
  databaseUrl: '',
  databasePassword: 'unique-db-password',
  databaseSsl: true,
  corsOrigins: ['https://clinic.example.org'],
  allowNonOperationalProvenanceMode: false,
  smsEnabled: false,
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: ''
};

test('development does not require production infrastructure secrets', () => {
  assert.equal(validateProductionConfig({ nodeEnv: 'development' }).production, false);
});

test('accepts valid production-only infrastructure configuration', () => {
  assert.equal(validateProductionConfig(validProductionConfig).production, true);
});

test('rejects missing, weak, shared or placeholder production secrets', () => {
  for (const override of [
    { jwtSecret: 'short-secret' },
    { jwtSecret: 'GENERATED_BY_SETUP_SCRIPT'.padEnd(56, 'x') },
    { internalServiceToken: 'short' },
    { internalServiceToken: 'a'.repeat(56) },
    { internalServiceToken: 'ci-token-placeholder-value'.padEnd(40, 'x') }
  ]) {
    assert.throws(() => validateProductionConfig({ ...validProductionConfig, ...override }));
  }
});

test('requires validated database TLS and a database credential', () => {
  assert.throws(() => validateProductionConfig({ ...validProductionConfig, databaseSsl: false }), /DB_SSL=true/);
  assert.throws(() => validateProductionConfig({ ...validProductionConfig, databasePassword: '' }), /database password/);
});

test('requires public HTTPS CORS origins without localhost or URL paths', () => {
  for (const corsOrigins of [
    ['http://clinic.example.org'],
    ['http://localhost:5173'],
    ['https://clinic.example.org/admin'],
    [],
    ['not-a-url']
  ]) {
    assert.throws(() => validateProductionConfig({ ...validProductionConfig, corsOrigins }));
  }
});

test('prohibits production non-operational mode override', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    allowNonOperationalProvenanceMode: true
  }), /prohibited in production/);
});

test('requires complete Twilio settings if SMS is enabled', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    smsEnabled: true
  }), /Twilio credentials/);
});
