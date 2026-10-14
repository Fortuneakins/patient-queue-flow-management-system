const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : env.DB),
  max: 15,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000,
  options: '-c timezone=Africa/Johannesburg'
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
