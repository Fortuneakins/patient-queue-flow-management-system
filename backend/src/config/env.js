const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const { resolveDataProvenancePolicy } = require('./dataProvenancePolicy');
const { asBoolean, validateProductionConfig } = require('./runtimePolicy');
const NODE_ENV = process.env.NODE_ENV || 'development';
const dataProvenancePolicy = resolveDataProvenancePolicy({
  nodeEnv: NODE_ENV,
  configuredMode: process.env.DATA_PROVENANCE_MODE,
  allowNonOperationalInProduction: process.env.ALLOW_NON_OPERATIONAL_PROVENANCE_MODE
});
const JWT_SECRET = required('JWT_SECRET');
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(v => v.trim()).filter(Boolean);
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN?.trim() || '';
const DATABASE_URL = process.env.DATABASE_URL || null;
const DB_SSL = asBoolean(process.env.DB_SSL);
const SMS_ENABLED = asBoolean(process.env.SMS_ENABLED);
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

validateProductionConfig({
  nodeEnv: NODE_ENV,
  jwtSecret: JWT_SECRET,
  internalServiceToken: INTERNAL_SERVICE_TOKEN,
  databaseUrl: DATABASE_URL,
  databasePassword: process.env.DB_PASSWORD || '',
  databaseSsl: DB_SSL,
  corsOrigins: CORS_ORIGIN,
  allowNonOperationalProvenanceMode: process.env.ALLOW_NON_OPERATIONAL_PROVENANCE_MODE,
  smsEnabled: SMS_ENABLED,
  twilioAccountSid: TWILIO_ACCOUNT_SID,
  twilioAuthToken: TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: TWILIO_PHONE_NUMBER
});

const trustProxyValue = String(process.env.TRUST_PROXY_HOPS || '0').trim();
const TRUST_PROXY_HOPS = trustProxyValue === 'true'
  ? true
  : trustProxyValue === 'false' || trustProxyValue === ''
    ? false
    : Number.isInteger(Number(trustProxyValue)) && Number(trustProxyValue) >= 0
      ? Number(trustProxyValue)
      : (() => { throw new Error('TRUST_PROXY_HOPS must be a non-negative integer, true or false.'); })();

module.exports = {
  NODE_ENV,
  DATA_PROVENANCE_MODE: dataProvenancePolicy.mode,
  DATA_PROVENANCE_MODE_SOURCE: dataProvenancePolicy.source,
  DATA_PROVENANCE_ALLOWED_MODES: dataProvenancePolicy.allowedModes,
  DATA_PROVENANCE_POLICY_PRODUCTION_GUARDED: dataProvenancePolicy.productionGuarded,
  ALLOW_NON_OPERATIONAL_PROVENANCE_MODE: asBoolean(process.env.ALLOW_NON_OPERATIONAL_PROVENANCE_MODE),
  TRUST_PROXY_HOPS,
  DB_SSL,
  PORT: Number(process.env.PORT || 5000),
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ORIGIN,
  INTERNAL_SERVICE_TOKEN,
  DATABASE_URL,
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'pqfms_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  },
  SMS_ENABLED,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  ANALYTICS_URL: process.env.ANALYTICS_URL || 'http://localhost:5001',
  STAFFED_STATIONS: Math.max(1, Number(process.env.STAFFED_STATIONS || 1))
};
