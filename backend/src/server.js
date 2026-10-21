const { httpServer } = require('./app');
const { pool } = require('./db/pool');
const env = require('./config/env');
const { assertProductionDatabaseSafety } = require('./utils/productionReadiness');

async function start() {
  await pool.query('SELECT 1');
  await assertProductionDatabaseSafety({
    nodeEnv: env.NODE_ENV,
    pool,
  });
  httpServer.listen(env.PORT, () => console.log(`PQFMS API listening on port ${env.PORT} (${env.NODE_ENV})`));
}

start().catch(error => {
  // Do not log SQL text, connection strings or secret-bearing environment values.
  console.error('PQFMS API failed to start:', error.message);
  process.exit(1);
});
