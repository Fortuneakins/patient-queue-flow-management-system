const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const testDirectory = path.join(backendRoot, 'tests', 'integration');

dotenv.config({ path: path.join(projectRoot, '.env') });
process.env.RUN_DB_TESTS = '1';

if (!process.env.DB_NAME) {
  console.error('Integration tests require DB_NAME. Set it in the project .env file or environment.');
  process.exit(2);
}

const files = fs.readdirSync(testDirectory)
  .filter(filename => filename.endsWith('.test.js'))
  .sort()
  .map(filename => path.join(testDirectory, filename));

if (!files.length) {
  console.error('No integration test files were found.');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', ...files],
  { cwd: backendRoot, env: process.env, stdio: 'inherit' }
);

if (result.error) {
  console.error('Could not start the integration test runner:', result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
