const SOUTH_AFRICAN_MOBILE = /^(?:0)(6|7|8)[0-9]{8}$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const PASSPORT = /^[A-Za-z0-9]{6,15}$/;
const USERNAME = /^[A-Za-z0-9_.-]{3,50}$/;
const STAFF_ROLES = new Set(['RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN']);

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toUpperCase() : '';
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/[\s()-]/g, '');
  if (E164.test(raw)) return raw;
  if (SOUTH_AFRICAN_MOBILE.test(raw)) return `+27${raw.slice(1)}`;
  return null;
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateSouthAfricanId(value) {
  if (typeof value !== 'string' || !/^\d{13}$/.test(value)) return { valid: false, reason: 'SA ID must contain exactly 13 digits.' };
  const yy = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  const dd = Number(value.slice(4, 6));
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentYY = currentYear % 100;
  const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
  if (!validDateParts(fullYear, mm, dd)) return { valid: false, reason: 'SA ID contains an invalid birth date.' };

  let sum = 0;
  for (let i = 0; i < 12; i += 2) sum += Number(value[i]);
  let doubled = '';
  for (let i = 1; i < 12; i += 2) doubled += String(Number(value[i]) * 2);
  for (const digit of doubled) sum += Number(digit);
  const check = (10 - (sum % 10)) % 10;
  if (check !== Number(value[12])) return { valid: false, reason: 'SA ID check digit is invalid.' };
  return { valid: true, date_of_birth: `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
}

function normalizeIdentificationNumber(value, type) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (type === 'SA_ID') return /^\d{13}$/.test(normalized) ? normalized : null;
  return PASSPORT.test(normalized) ? normalized : null;
}

function validatePatientPayload(payload) {
  const identification_type = typeof payload.identification_type === 'string' ? payload.identification_type.toUpperCase() : '';
  const identification_number = normalizeIdentificationNumber(payload.identification_number, identification_type);
  if (!['SA_ID', 'PASSPORT'].includes(identification_type)) return { valid: false, error: 'Identification type must be SA_ID or PASSPORT.' };
  if (!identification_number) return { valid: false, error: identification_type === 'SA_ID' ? 'SA ID must contain exactly 13 digits.' : 'Passport must contain 6–15 letters or digits.' };
  let date_of_birth = payload.date_of_birth;
  if (identification_type === 'SA_ID') {
    const idResult = validateSouthAfricanId(identification_number);
    if (!idResult.valid) return { valid: false, error: idResult.reason };
    date_of_birth = idResult.date_of_birth;
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date_of_birth || ''))) {
    return { valid: false, error: 'A valid date of birth is required for passport holders.' };
  }
  const full_name = String(payload.full_name || '').trim();
  if (full_name.length < 2 || full_name.length > 150) return { valid: false, error: 'Full name must be between 2 and 150 characters.' };
  const contact_no = normalizePhone(payload.contact_no);
  if (!contact_no) return { valid: false, error: 'Enter a valid South African mobile number or E.164 number.' };
  return { valid: true, value: { identification_type, identification_number, full_name, date_of_birth, contact_no } };
}

function validateSymptoms(value) {
  const symptoms = String(value ?? '').trim();
  return symptoms.length >= 1 && symptoms.length <= 500 ? symptoms : null;
}

function validateTier(value) {
  const tier = Number(value);
  return Number.isInteger(tier) && tier >= 1 && tier <= 4 ? tier : null;
}

function validateUsername(value) {
  return typeof value === 'string' && USERNAME.test(value.trim());
}

function isProductionPasswordPolicy() {
  return String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';
}

function passwordPolicyMessage() {
  return isProductionPasswordPolicy()
    ? 'Password must be at least 14 characters and include uppercase, lowercase, numeric and special characters; do not use a known demo or placeholder password.'
    : 'Password must be at least 8 characters.';
}

function validatePassword(value) {
  if (typeof value !== 'string') return false;
  if (!isProductionPasswordPolicy()) return value.length >= 8;
  // Production staff accounts use a stronger floor than local academic fixtures.
  // MFA remains a separate production go-live requirement; this is not a substitute.
  return value.length >= 14
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value)
    && !/DemoPass2026!|password|change-me/i.test(value);
}

module.exports = {
  normalizeRole,
  normalizePhone,
  validateSouthAfricanId,
  normalizeIdentificationNumber,
  validatePatientPayload,
  validateSymptoms,
  validateTier,
  validateUsername,
  validatePassword,
  passwordPolicyMessage,
  isProductionPasswordPolicy,
  STAFF_ROLES
};
