const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = required('JWT_SECRET');
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(v => v.trim()).filter(Boolean);
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN?.trim() || '';

module.exports = {
  NODE_ENV,
  PORT: Number(process.env.PORT || 5000),
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ORIGIN,
  INTERNAL_SERVICE_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL || null,
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'pqfms_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  },
  SMS_ENABLED: String(process.env.SMS_ENABLED || 'false').toLowerCase() === 'true',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
  TWILIO_WEBHOOK_URL: process.env.TWILIO_WEBHOOK_URL || '',
  ANALYTICS_URL: process.env.ANALYTICS_URL || 'http://localhost:5001',
  STAFFED_STATIONS: Math.max(1, Number(process.env.STAFFED_STATIONS || 1))
};
