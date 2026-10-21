const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : env.DB),
  ...(env.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
  max: 15,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000,
  query_timeout: 15000,
  statement_timeout: 15000,
  application_name: 'pqfms-api',
  options: '-c timezone=Africa/Johannesburg -c idle_in_transaction_session_timeout=10000'
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
