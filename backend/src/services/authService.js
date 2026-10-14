const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');
const env = require('../config/env');
const { normalizeRole, validatePassword, validateUsername, STAFF_ROLES } = require('../utils/validation');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function createToken(staff) {
  return jwt.sign(
    {
      staff_id: staff.staff_id,
      username: staff.username,
      role: normalizeRole(staff.role),
      extra_permissions: staff.extra_permissions || []
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: 'pqfms', audience: 'pqfms-web' }
  );
}

async function getStaffById(staffId) {
  const result = await query(
    `SELECT staff_id, username, role, is_active, must_reset_password, extra_permissions, contact_no, employee_id
     FROM clinic_staff WHERE staff_id = $1`, [staffId]
  );
  return result.rows[0] || null;
}

async function getStaffByUsername(username) {
  const result = await query('SELECT * FROM clinic_staff WHERE username = $1', [username]);
  return result.rows[0] || null;
}

async function login({ username, password, ipAddress }) {
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername || typeof password !== 'string') {
    return { ok: false, status: 401, error: 'Invalid credentials' };
  }

  const staff = await getStaffByUsername(normalizedUsername);
  if (!staff) return { ok: false, status: 401, error: 'Invalid credentials' };
  const valid = await verifyPassword(password, staff.password_hash);
  if (!valid) return { ok: false, status: 401, error: 'Invalid credentials' };
  if (!staff.is_active) return { ok: false, status: 403, error: 'This account has been deactivated. Please contact an administrator.' };

  try {
    await query('INSERT INTO login_events (staff_id, ip_address) VALUES ($1, $2)', [staff.staff_id, ipAddress || null]);
  } catch (error) {
    console.error('[AUTH] Could not record login event:', error.message);
  }
  const token = createToken(staff);
  return {
    ok: true,
    status: 200,
    data: {
      token,
      staff_id: staff.staff_id,
      username: staff.username,
      role: normalizeRole(staff.role),
      must_reset_password: staff.must_reset_password === true,
      extra_permissions: staff.extra_permissions || []
    }
  };
}

async function createStaff({ username, password, role, contact_no, employee_id }) {
  const normalizedUsername = String(username || '').trim();
  const normalizedRole = normalizeRole(role);
  if (!validateUsername(normalizedUsername)) throw Object.assign(new Error('Username must be 3–50 characters and use letters, numbers, dot, underscore or hyphen.'), { status: 400 });
  if (!validatePassword(password)) throw Object.assign(new Error('Password must be at least 8 characters.'), { status: 400 });
  if (!STAFF_ROLES.has(normalizedRole)) throw Object.assign(new Error('Invalid staff role.'), { status: 400 });
  const password_hash = await hashPassword(password);
  try {
    const result = await query(
      `INSERT INTO clinic_staff (username, password_hash, role, contact_no, employee_id, must_reset_password)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING staff_id, username, role, is_active, must_reset_password, extra_permissions, contact_no, employee_id`,
      [normalizedUsername, password_hash, normalizedRole, contact_no || null, employee_id || null]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('A staff account with that username already exists.'), { status: 409 });
    throw error;
  }
}

async function changePassword(staffId, currentPassword, newPassword) {
  if (!validatePassword(newPassword)) throw Object.assign(new Error('New password must be at least 8 characters.'), { status: 400 });
  const staffResult = await query('SELECT password_hash FROM clinic_staff WHERE staff_id = $1 AND is_active = true', [staffId]);
  if (!staffResult.rows[0]) throw Object.assign(new Error('Account not found.'), { status: 404 });
  if (!(await verifyPassword(currentPassword, staffResult.rows[0].password_hash))) throw Object.assign(new Error('Current password is incorrect.'), { status: 401 });
  const password_hash = await hashPassword(newPassword);
  await query('UPDATE clinic_staff SET password_hash = $1, must_reset_password = false WHERE staff_id = $2', [password_hash, staffId]);
}

async function updateStatus(targetId, isActive, actorId) {
  if (String(targetId) === String(actorId) && !isActive) throw Object.assign(new Error('You cannot deactivate your own account.'), { status: 400 });
  const result = await query(
    `UPDATE clinic_staff SET is_active = $1 WHERE staff_id = $2
     RETURNING staff_id, username, role, is_active, must_reset_password, extra_permissions, contact_no, employee_id`,
    [isActive, targetId]
  );
  if (!result.rows[0]) throw Object.assign(new Error('Staff account not found.'), { status: 404 });
  return result.rows[0];
}

async function setPermission(targetId, permission, grant) {
  if (permission !== 'VIEW_STAFF_DIRECTORY') throw Object.assign(new Error('Unknown permission.'), { status: 400 });
  const result = grant
    ? await query(`UPDATE clinic_staff SET extra_permissions = ARRAY(SELECT DISTINCT unnest(extra_permissions || $1::text[])) WHERE staff_id = $2 RETURNING staff_id, username, extra_permissions`, [[permission], targetId])
    : await query(`UPDATE clinic_staff SET extra_permissions = array_remove(extra_permissions, $1) WHERE staff_id = $2 RETURNING staff_id, username, extra_permissions`, [permission, targetId]);
  if (!result.rows[0]) throw Object.assign(new Error('Staff account not found.'), { status: 404 });
  return result.rows[0];
}

async function listStaff() {
  const result = await query(`SELECT staff_id, username, UPPER(TRIM(role)) AS role, is_active, must_reset_password, contact_no, employee_id, extra_permissions FROM clinic_staff ORDER BY is_active DESC, staff_id ASC`);
  return result.rows;
}

async function loginHistory(staffId) {
  const result = await query(`SELECT event_id, logged_in_at, ip_address FROM login_events WHERE staff_id = $1 ORDER BY logged_in_at DESC LIMIT 20`, [staffId]);
  return result.rows;
}

module.exports = { hashPassword, verifyPassword, createToken, getStaffById, login, createStaff, changePassword, updateStatus, setPermission, listStaff, loginHistory };
