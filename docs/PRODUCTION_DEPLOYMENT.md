# PQFMS deployment and release-readiness runbook

> **Important boundary:** this is a technical deployment scaffold for controlled staging and an academic prototype. It is not clinical-go-live approval. The repository has not been clinically validated, has not been deployed at RMSH, and has not completed an independent production security/privacy assessment. Do not enter real patient data or rely on the wait-time outputs for care delivery until the deployment, clinical governance, legal/privacy, security, recovery and usability gates in this document have been independently completed and signed off.

## 1. Deployment design

The production Compose stack in `compose.production.yml` uses:

- **Caddy** as the only public entry point, with automatic HTTPS certificates and persisted certificate state.
- **Nginx** to serve the compiled React application and reverse-proxy same-origin API and Socket.IO requests. It does not expose Flask analytics directly; Express calls analytics over the private Compose network with the internal service token.
- **Node/Express API** for authentication, workflow validation, authorisation and PostgreSQL transactions.
- **Flask analytics under Gunicorn**, not Flask's development server.
- **Externally managed PostgreSQL with verified TLS**. The database is intentionally not exposed by Compose and the deployment stack does not seed demonstration data.
- A dedicated, checksum-tracked migration command (`npm run db:migrate`) and one-time first-administrator bootstrap (`npm run bootstrap:admin`).

The API and analytics services are on a private Compose network and are not published as host ports. The frontend uses same-origin `/api` and `/socket.io` routes. The browser never calls `/analytics` or an analytics host directly; the Express proxy adds service authentication and filters the public estimate response.

## 2. Production prerequisites

Before deployment, provision and test:

1. A supported Linux host or managed container platform with Docker Engine and Docker Compose v2. Keep the operating system and container runtime patched.
2. A DNS name whose public A/AAAA record points at the deployment host. Allow inbound TCP 80/443 (and UDP 443 only if HTTP/3 is enabled). Do not publish ports 5000, 5001 or 5432 publicly.
3. A managed PostgreSQL database with **three distinct roles**: `pqfms_migrator` for the one-shot migration job, `pqfms_service` for API runtime DML, and `pqfms_analytics` for column-level read-only analytics. The TLS certificate must chain to a CA trusted in the application containers, and its hostname must match `DB_HOST`.
4. Automated encrypted backups, point-in-time recovery where available, a retention policy, and a **successfully rehearsed restore** to a separate database. A backup is not proven until restore is tested.
5. A secret manager or protected host-level secret file, a monitored certificate contact email, an operational owner and a documented incident/rollback contact.
6. An independent decision from the organisation responsible for the clinic that the application is permitted to process patient information. This requires privacy/legal review and clinical/safety governance, not just passing software tests.

## 3. Prepare production secrets

On the deployment host, copy the template and **edit the copy only**:

```powershell
Copy-Item .env.production.example .env.production
```

The actual `.env.production` file is ignored by Git. Never put its values in source control, screenshots, support tickets, build arguments or application logs.

Populate the file with the public domain, monitored TLS contact email, managed PostgreSQL host/database/user/password, the delay-review threshold (default 60 minutes; whole values 1–1440), and two independently generated random secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Use separate outputs for `JWT_SECRET` and `INTERNAL_SERVICE_TOKEN`; do not use example text or the demo password. For a real deployment, generate and deliver these values through your secrets manager rather than leaving them in command history. Restrict access to the production environment file (for example, file ACLs to the deployment operator and service account only).

`DATA_PROVENANCE_MODE` is fixed to `OPERATIONAL` by the production Compose definition. Production refuses synthetic/demo mode. Run acceptance tests and demonstrations in a separate non-production environment with a separate database and credentials.

## 4. Validate the deployment configuration

From the repository root, first inspect the resolved Compose configuration without starting any containers:

```powershell
docker compose --env-file .env.production -f compose.production.yml config --quiet
```

If validation reports missing variables, fix the environment file before continuing. Confirm that the resolved configuration does not publish API/analytics/database ports and that only Caddy publishes 80/443.

Build the three application images:

```powershell
docker compose --env-file .env.production -f compose.production.yml build
```

The project CI builds these images as a basic packaging check. This does not certify their runtime configuration, database reachability or operational security.

## 4A. Provision database roles before first migration

Use the managed PostgreSQL administration connection to create separate principals. Store each password in the secret manager; `\\password` in an interactive `psql` session avoids putting the password directly in SQL text or terminal history.

```sql
CREATE ROLE pqfms_migrator LOGIN;
CREATE ROLE pqfms_service LOGIN;
CREATE ROLE pqfms_analytics LOGIN;

GRANT CONNECT ON DATABASE pqfms TO pqfms_migrator, pqfms_service, pqfms_analytics;
GRANT USAGE, CREATE ON SCHEMA public TO pqfms_migrator;
GRANT USAGE ON SCHEMA public TO pqfms_service, pqfms_analytics;

-- Applies to objects created by the migration owner from this point forward.
ALTER DEFAULT PRIVILEGES FOR ROLE pqfms_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO pqfms_service;
ALTER DEFAULT PRIVILEGES FOR ROLE pqfms_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pqfms_service;
```

If the roles already exist, inspect their membership and grants rather than recreating or resetting them. The migration principal must also be permitted to create required extensions in the managed database; never make the API runtime role a superuser or schema owner to work around a migration error.

The API runtime role must have the table/sequence DML grants needed by the application, plus read access to the migration ledger for startup verification. This explicit current-schema grant also covers a previously reviewed baseline whose tables were not created by the migration owner; it does not make the API role a schema owner:

```sql
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pqfms_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pqfms_service;
GRANT DELETE ON TABLE public.shifts, public.queue_pathway_progress TO pqfms_service;

GRANT SELECT ON TABLE public.pqfms_schema_migrations TO pqfms_service;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pqfms_schema_migrations FROM pqfms_service;

-- The analytics principal receives only the columns queried by the estimator.
GRANT SELECT (status, priority_level, queued_at, called_at, discharged_at, data_provenance)
  ON TABLE public.queue_entries TO pqfms_analytics;
```

Set `DB_USER/DB_PASSWORD` to the API runtime role, `MIGRATION_DB_USER/MIGRATION_DB_PASSWORD` to the migration owner, and `ANALYTICS_DB_USER/ANALYTICS_DB_PASSWORD` to the read-only analytics principal. The API container must never receive the migration-owner password. Do not start the API until grants are verified. On future releases, apply new migrations only with the migration role, then verify new table/sequence default privileges and extend analytics column grants only when required by an independently reviewed query change.

## 5. Apply migrations safely

### New, empty production database

Run migrations **before** starting the API:

```powershell
docker compose --env-file .env.production -f compose.production.yml run --rm migrate
```

The runner serialises migrations with a PostgreSQL advisory lock, stores filename and SHA-256 checksum in `pqfms_schema_migrations`, records each migration transactionally, refuses to run a changed version of an already-applied migration, and leaves future migration files pending. Review the migration output and database state before continuing.

**Do not run** `scripts/database.ps1` in production: it is a development initialiser that loads demonstration patients and accounts, and explicitly refuses production mode.

### Existing database

Take a backup and verify it can be restored before baselining or applying schema changes. The migration runner will not guess the history of an existing database that has no migration ledger.

For a previously reviewed database whose schema and source backfill already match migrations 001–008, the explicit baseline flow is:

Use the production Compose environment for the database operation. Only after a verified backup/restore rehearsal and manual confirmation that this database really matches migrations 001–008, run:

```powershell
$confirmation = Read-Host 'Type BASELINE pqfms_db only after reviewing the existing schema and verified backup'
if ($confirmation -ne 'BASELINE pqfms_db') { throw 'Baseline cancelled; no database changes were made.' }

docker compose --env-file .env.production -f compose.production.yml run --rm -e PQFMS_CONFIRM_BASELINE_REVIEWED=YES_I_VERIFIED_MIGRATIONS_001_008 migrate npm run db:migrate -- --baseline-existing
if ($LASTEXITCODE -ne 0) { throw 'Baseline failed. Stop and inspect the database before retrying.' }
```

This procedure does not execute migrations 001–008; it checks schema markers and requires explicit confirmation before writing their checksums to the ledger. It also checks the migration-008 provenance-source backfill. The one-off job uses the configured production database endpoint, TLS settings and migration-owner credentials from `.env.production`; it does not use the developer's local `.env`. If any check fails, stop and compare the restored backup, schema and migration history. Do not force the baseline, delete the ledger, reset the database or run old migrations against retained data. If the source backfill has not been applied, apply migration 008 explicitly after backup and review before attempting the baseline.

For any database state other than a verified 001–008 schema, use a reviewed migration plan that records which scripts have truly been applied. Never baseline a schema just because the tables have familiar names.

### Verify the read-only analytics database principal

The analytics role is created in step 4A. Do not try to create the same role again on later releases. After migrations have been applied, verify that the read-only principal has the required access:

```sql
GRANT CONNECT ON DATABASE pqfms TO pqfms_analytics;
GRANT USAGE ON SCHEMA public TO pqfms_analytics;
GRANT SELECT (status, priority_level, queued_at, called_at, discharged_at, data_provenance)
  ON TABLE public.queue_entries TO pqfms_analytics;
```

Set a unique strong password for this role through the approved secret-management process (for example, `\\password pqfms_analytics` in an interactive `psql` session). If you use a database name other than `pqfms`, adjust the `GRANT CONNECT` statement. Put these values in `ANALYTICS_DB_USER` and `ANALYTICS_DB_PASSWORD` in the protected deployment environment. The production analytics service receives only the analytics principal and the API username for a startup check; it does not receive the API password. It reads only the columns used to estimate active queue workload and historical consultation duration. It has no write grant. If a future feature needs extra columns or tables, review and grant only the minimum additional permissions.

The API runtime identity has DML permissions but is not a schema owner. Keep migration-owner credentials out of both runtime services.

### Scaling boundary

The Compose template is intentionally a **single API/analytics deployment**. The current in-memory rate limiters are per process, and Socket.IO is not configured with a cross-replica adapter. Do not scale the API horizontally or place multiple independent replicas behind a load balancer until login/endpoint rate limits use a shared store (with expiry and abuse controls), Socket.IO refresh events are coordinated, and multi-replica concurrency/health behaviour is tested. The database remains the source of truth; an extra replica must not create the illusion of coordinated protections that are only local to one process.

## 6. Create the first production administrator

The normal API intentionally refuses to start in production while the seeded demonstration usernames remain. Do not seed the demo accounts in production.

After a successful schema migration and while the staff table is empty, provision the first named administrator through the one-time utility. Obtain the username and high-entropy password from the organisation's approved identity/secrets process, set them temporarily in the deployment environment and run:

```powershell
$env:PQFMS_BOOTSTRAP_ADMIN_USERNAME = "<approved-admin-username>"
$env:PQFMS_BOOTSTRAP_ADMIN_PASSWORD = "<unique 14+ character password from the secret manager>"
docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps -e PQFMS_BOOTSTRAP_ADMIN_USERNAME -e PQFMS_BOOTSTRAP_ADMIN_PASSWORD api npm run bootstrap:admin
Remove-Item Env:PQFMS_BOOTSTRAP_ADMIN_USERNAME
Remove-Item Env:PQFMS_BOOTSTRAP_ADMIN_PASSWORD
```

The utility only operates in production, refuses to create an account if any staff record already exists, hashes the password, writes an audit event and does not print the password. If an account already exists, do not delete staff records just to rerun the bootstrap. Follow the organisation's controlled account-recovery process instead.

This bootstrap does **not** implement multi-factor authentication. MFA is a release blocker for genuine clinical deployment unless the responsible organisation formally accepts an alternative control through its security risk process.

## 7. Start services and verify health

```powershell
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 caddy web api analytics
```

Use the deployment's public HTTPS hostname to check:

- `/api/health/live` reports the API process is alive.
- `/api/health/ready` reports database readiness.
- The Compose analytics healthcheck calls `/api/health/ready` inside the private analytics container network. Flask health and prediction routes are not published through Nginx.
- The public display board hides patient names, identification numbers and consultation notes.
- A synthetic check-in, call, note, discharge and history lookup pass in the *separate staging environment*.
- Every new check-in has its expected server-assigned provenance source; test/demo observations never count as operational model evidence.
- If there are no rostered doctors while work is active, wait estimates become unavailable rather than falsely returning zero minutes.
- Clinic Intelligence review prompts show their rule ID, evidence, assumptions and human action; no rule changes a clinician-assigned tier.
- Caddy has obtained a valid certificate and the browser sees HTTPS without certificate warnings.

Do not test using real patient identifiers or clinical notes in the development/CI environment.

## 8. Operational controls required before a real-clinic go-live

Passing application CI is necessary, not sufficient. Obtain written evidence for all of these items:

- **Identity and access:** MFA for privileged staff, documented staff account provisioning/deprovisioning, role/permission review, credential rotation, session/token expiry and recovery procedures.
- **Privacy/security:** independent penetration test, threat model, access-log/privacy review, retention/deletion policy, secrets management, vulnerability remediation, incident response and relevant jurisdictional legal/privacy approval.
- **Database and recovery:** encrypted backups, restore rehearsal, restore-time objective, recovery-point objective, failover behaviour, migration rollback strategy and database least-privilege.
- **Clinical safety and usability:** clinical owner approval of the workflow, prioritisation and patient-display semantics; accessibility testing; downtime/paper fallback; human factors; staff training; and a tested process for correcting erroneous queue data.
- **Analytics validation:** prospective evaluation against independently collected, representative operational observations; sufficient sample size and confidence intervals; drift and missing-data monitoring; stratified review; transparent uncertainty; and sign-off by responsible clinical/operations staff. Do not represent a deterministic scenario or the synthetic Continuity Lab as a clinical validation study.
- **Communications/integration:** verified consent handling, real provider delivery tests and failure handling if SMS is enabled; contracts and interface validation before any real external-health-system exchange.
- **Release governance:** immutable image digests, software bill of materials, vulnerability scans, pinned dependency/image updates, release tag, change approvals, monitoring/alerting, service ownership, rollback/incident runbooks and a documented maintenance window.

The repository's current academic scope does not itself supply evidence for these approvals. In particular, it does not provide MFA, clinical validation, a complete disaster-recovery rehearsal or independent production security/privacy sign-off.

## 9. Rollback and incident safety

- Never roll back by running older SQL migrations or deleting migration checksums.
- Prefer deploying the previous immutable image while using a schema that is backward-compatible with both versions. Database schema rollback needs a separately reviewed recovery plan.
- Stop traffic before a recovery action that might cause patient-queue divergence; follow the clinic's approved paper/downtime procedure.
- Preserve database backups and append-only operational event evidence; do not edit records merely to make metrics look normal.
- If analytics is unavailable, the queue workflow should continue while estimates clearly show unavailable/degraded state. Clinical staff must use established procedures, not a missing estimate, to determine patient priority.
