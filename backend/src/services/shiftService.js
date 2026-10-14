const { query } = require('../db/pool');

function validateShiftTimes(start, end) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw Object.assign(new Error('Start and end times must use HH:MM.'), { status: 400 });
  if (start >= end) throw Object.assign(new Error('Start time must be before end time.'), { status: 400 });
}

async function createShift({ staffId, shiftDate, startTime, endTime }) {
  if (!staffId || !shiftDate || !startTime || !endTime) throw Object.assign(new Error('staff_id, shift_date, start_time and end_time are required.'), { status: 400 });
  validateShiftTimes(startTime, endTime);
  try {
    const result = await query(`INSERT INTO shifts (staff_id, shift_date, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING shift_id, staff_id, shift_date, start_time, end_time`, [staffId, shiftDate, startTime, endTime]);
    return result.rows[0];
  } catch (error) {
    if (error.code === '23P01') throw Object.assign(new Error('This shift overlaps another shift for the same staff member.'), { status: 409 });
    if (error.code === '23505') throw Object.assign(new Error('An identical shift already exists.'), { status: 409 });
    throw error;
  }
}

async function listShifts({ date }) {
  const sql = date
    ? `SELECT s.shift_id, s.staff_id, s.shift_date, s.start_time, s.end_time, cs.username, cs.role FROM shifts s JOIN clinic_staff cs ON cs.staff_id=s.staff_id WHERE s.shift_date=$1 ORDER BY s.start_time, cs.username`
    : `SELECT s.shift_id, s.staff_id, s.shift_date, s.start_time, s.end_time, cs.username, cs.role FROM shifts s JOIN clinic_staff cs ON cs.staff_id=s.staff_id WHERE s.shift_date >= (NOW() AT TIME ZONE 'Africa/Johannesburg')::date ORDER BY s.shift_date, s.start_time, cs.username LIMIT 200`;
  const result = await query(sql, date ? [date] : []);
  return result.rows;
}

async function deleteShift(shiftId) {
  const result = await query('DELETE FROM shifts WHERE shift_id = $1 RETURNING shift_id', [shiftId]);
  if (!result.rows[0]) throw Object.assign(new Error('Shift not found.'), { status: 404 });
  return result.rows[0];
}

async function getOnDutyCount() {
  const result = await query(`
    SELECT COUNT(DISTINCT s.staff_id)::int AS on_duty
    FROM shifts s JOIN clinic_staff cs ON cs.staff_id=s.staff_id
    WHERE cs.role='DOCTOR' AND cs.is_active=true
      AND s.shift_date=(NOW() AT TIME ZONE 'Africa/Johannesburg')::date
      AND (NOW() AT TIME ZONE 'Africa/Johannesburg')::time BETWEEN s.start_time AND s.end_time`);
  return Number(result.rows[0].on_duty);
}

module.exports = { createShift, listShifts, deleteShift, getOnDutyCount };
