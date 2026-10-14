# NFR-05 Load Test

The repository includes a dependency-free Node.js load probe at `tests/load/run.js`.

Default configuration follows NFR-05 from the academic report: **50 concurrent simulated users for 60 seconds** against the authenticated staff queue endpoint.

Run locally after the application and database are running:

```powershell
npm run load-test
```

Optional environment variables:

```text
LOAD_TEST_URL
LOAD_TEST_USERNAME
LOAD_TEST_PASSWORD
LOAD_TEST_CONCURRENCY
LOAD_TEST_DURATION_SECONDS
```

The script reports request count, error count, error rate, p50, p95 and p99 latency and exits non-zero if p95 exceeds 2 seconds or any request returns an error.

## Evidence capture

Copy the final JSON output from the release test run into the evidence package and record the date, operating system, Node.js version, PostgreSQL version, exact Git commit and test configuration. Do not alter results after the test run.
