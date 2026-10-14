const jwt = require('jsonwebtoken');
const { getStaffById } = require('../services/authService');
const env = require('../config/env');

async function authenticate(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'pqfms',
      audience: 'pqfms-web'
    });
    const staff = await getStaffById(decoded.staff_id);
    if (!staff || !staff.is_active) return res.status(401).json({ error: 'Authentication required.' });
    // Role/permission claims are bound to the signed-in token. Account activation is
    // checked against the database on every request so deactivation is immediate,
    // while permission changes take effect on the next sign-in as specified.
    req.user = {
      staff_id: staff.staff_id,
      username: staff.username,
      role: String(decoded.role || staff.role).toUpperCase(),
      extra_permissions: Array.isArray(decoded.extra_permissions) ? decoded.extra_permissions : [],
      must_reset_password: staff.must_reset_password === true
    };
    next();
  } catch (_error) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
}

function requireReadyPassword(req, res, next) {
  if (req.user?.must_reset_password) return res.status(403).json({ error: 'You must change your temporary password before using this function.' });
  next();
}

function authorizeRoles(...roles) {
  const allowed = roles.map(role => String(role).toUpperCase());
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}

function authorizeRolesOrPermission(roles, permission) {
  const allowed = roles.map(role => String(role).toUpperCase());
  return (req, res, next) => {
    const roleAllowed = allowed.includes(req.user?.role);
    const permissionAllowed = req.user?.extra_permissions?.includes(permission);
    if (!roleAllowed && !permissionAllowed) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}

function requireInternalService(req, res, next) {
  if (!env.INTERNAL_SERVICE_TOKEN || req.get('X-Internal-Service-Token') !== env.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Internal service authentication required.' });
  }
  next();
}

module.exports = { authenticate, authorizeRoles, authorizeRolesOrPermission, requireReadyPassword, requireInternalService };
