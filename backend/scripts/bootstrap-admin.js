const env = require('../src/config/env');
const { pool, withTransaction } = require('../src/db/pool');
const { hashPassword } = require('../src/services/authService');
const { appendOperationalEvent } = require('../src/services/operationalEventService');

function requireStrongBootstrapPassword(value) {
  if (
    typeof value !== 'string'
    || value.length < 14
    || !/[a-z]/.test(value)
    || !/[A-Z]/.test(value)
    || !/[0-9]/.test(value)
    || !/[^A-Za-z0-9]/.test(value)
    || /DemoPass2026!|password|change-me/i.test(value)
  ) {
    throw new Error('Bootstrap password must be at least 14 characters and include uppercase, lowercase, numeric and special characters.');
  }
}

async function main() {
  if (env.NODE_ENV !== 'production') {
    throw new Error('This one-time bootstrap utility is only for a configured production environment. Use the seeded demo account in development.');
  }

  const username = String(process.env.PQFMS_BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const password = process.env.PQFMS_BOOTSTRAP_ADMIN_PASSWORD;
  const employeeId = String(process.env.PQFMS_BOOTSTRAP_ADMIN_EMPLOYEE_ID || '').trim() || null;
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    throw new Error('PQFMS_BOOTSTRAP_ADMIN_USERNAME must be 3–50 characters and use letters, numbers, dot, underscore or hyphen.');
  }
  requireStrongBootstrapPassword(password);

  const existing = await pool.query('SELECT COUNT(*)::int AS staff_count FROM clinic_staff');
  if (Number(existing.rows[0].staff_count) !== 0) {
    throw new Error('Bootstrap blocked because a staff account already exists. This command can create only the first administrator on an empty staff table.');
  }

  const passwordHash = await hashPassword(password);
  const staff = await withTransaction(async client => {
    const result = await client.query(
      `INSERT INTO clinic_staff (username, password_hash, role, is_active, must_reset_password, employee_id)
       VALUES ($1, $2, 'ADMIN', TRUE, FALSE, $3)
       RETURNING staff_id, username, role`,
      [username, passwordHash, employeeId]
    );
    const account = result.rows[0];
    await appendOperationalEvent(client, {
      eventType: 'PRODUCTION_ADMIN_BOOTSTRAPPED',
      entityType: 'STAFF_ACCOUNT',
      entityId: account.staff_id,
      actorStaffId: account.staff_id,
      toState: 'ACTIVE',
      metadata: { username: account.username, bootstrap_method: 'one_time_cli', environment: 'production' }
    });
    return account;
  });

  // Reduce accidental exposure if later code inspects process.env in this process.
  delete process.env.PQFMS_BOOTSTRAP_ADMIN_PASSWORD;
  console.log(`Created the first production administrator account (${staff.username}, staff ID ${staff.staff_id}). The password was not printed. Remove bootstrap environment variables from the deployment environment now.`);
}

main()
  .catch(error => {
    console.error('Production administrator bootstrap failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
