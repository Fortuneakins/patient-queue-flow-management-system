const { httpServer } = require('./app');
const { pool } = require('./db/pool');
const env = require('./config/env');

async function start() {
  await pool.query('SELECT 1');
  httpServer.listen(env.PORT, () => console.log(`PQFMS API listening on http://localhost:${env.PORT}`));
}

start().catch(error => {
  console.error('PQFMS API failed to start:', error.message);
  process.exit(1);
});
