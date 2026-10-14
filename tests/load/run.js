/*
 * Lightweight, dependency-free performance probe for the assessed local release.
 * It uses Node 18+ fetch, so no third-party load-test package is required.
 *
 * Defaults are aligned with NFR-05: 50 concurrent simulated users for 60 seconds.
 * Override with LOAD_TEST_URL, LOAD_TEST_USERNAME, LOAD_TEST_PASSWORD,
 * LOAD_TEST_CONCURRENCY and LOAD_TEST_DURATION_SECONDS.
 */
const baseUrl = (process.env.LOAD_TEST_URL || 'http://localhost:5000').replace(/\/$/, '');
const username = process.env.LOAD_TEST_USERNAME || 'doctor_demo';
const password = process.env.LOAD_TEST_PASSWORD || 'DemoPass2026!';
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 50);
const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS || 60);

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) {
  throw new Error('LOAD_TEST_CONCURRENCY must be an integer between 1 and 200.');
}
if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 300) {
  throw new Error('LOAD_TEST_DURATION_SECONDS must be between 1 and 300.');
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Login failed (${response.status}): ${body.error || 'unknown error'}`);
  return body.token;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, rank)];
}

async function worker(token, stopAt, results) {
  while (Date.now() < stopAt) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/queue`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const elapsed = performance.now() - started;
      results.latencies.push(elapsed);
      if (!response.ok) results.errors += 1;
      else await response.arrayBuffer();
      results.requests += 1;
    } catch (_error) {
      results.errors += 1;
      results.requests += 1;
    }
  }
}

async function main() {
  const token = await login();
  const stopAt = Date.now() + durationSeconds * 1000;
  const results = { requests: 0, errors: 0, latencies: [] };
  await Promise.all(Array.from({ length: concurrency }, () => worker(token, stopAt, results)));

  const p50 = percentile(results.latencies, 50);
  const p95 = percentile(results.latencies, 95);
  const p99 = percentile(results.latencies, 99);
  console.log(JSON.stringify({
    target: `${baseUrl}/api/queue`,
    concurrency,
    duration_seconds: durationSeconds,
    requests: results.requests,
    errors: results.errors,
    error_rate: results.requests ? Number((results.errors / results.requests).toFixed(4)) : 0,
    p50_ms: Number(p50.toFixed(2)),
    p95_ms: Number(p95.toFixed(2)),
    p99_ms: Number(p99.toFixed(2)),
    nfr_05_pass: results.errors === 0 && p95 <= 2000
  }, null, 2));

  if (results.errors > 0 || p95 > 2000) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
