const { query } = require('../db/pool');
const { validatePatientPayload } = require('../utils/validation');

async function createPatient(payload) {
  const validation = validatePatientPayload(payload);
  if (!validation.valid) throw Object.assign(new Error(validation.error), { status: 400 });
  const p = validation.value;
  try {
    const result = await query(
      `INSERT INTO patients (identification_number, identification_type, full_name, date_of_birth, contact_no)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING patient_id, identification_number, identification_type, full_name, date_of_birth, contact_no, created_at`,
      [p.identification_number, p.identification_type, p.full_name, p.date_of_birth, p.contact_no]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('A patient with that identification number already exists.'), { status: 409 });
    throw error;
  }
}

async function searchPatients(search) {
  const term = String(search || '').trim();
  const result = term
    ? await query(
        `SELECT patient_id, identification_number, identification_type, full_name, date_of_birth, contact_no, created_at
         FROM patients WHERE full_name ILIKE $1 OR identification_number ILIKE $1
         ORDER BY full_name ASC LIMIT 100`, [`%${term}%`]
      )
    : await query(`SELECT patient_id, identification_number, identification_type, full_name, date_of_birth, contact_no, created_at FROM patients ORDER BY patient_id DESC LIMIT 100`);
  return result.rows;
}

async function publicVerify(identificationNumber) {
  const result = await query(`SELECT patient_id, full_name FROM patients WHERE identification_number = $1`, [String(identificationNumber || '').trim().toUpperCase()]);
  return result.rows[0] || null;
}

module.exports = { createPatient, searchPatients, publicVerify };
